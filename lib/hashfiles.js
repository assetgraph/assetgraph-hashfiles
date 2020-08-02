const { ensureTrailingSlash } = require('urltools');

/** @typedef {import('assetgraph')} AssetGraph */
/** @typedef {import('assetgraph/lib/assets/Asset')} Asset */
/** @typedef {import('assetgraph/lib/relations/Relation')} Relation */

/**
 * @param {Asset} asset
 */
function isAssetSafeToMove(asset) {
  if (
    !asset.isLoaded ||
    asset.isRedirect ||
    asset.isInline ||
    ['CacheManifest', 'Rss', 'Atom'].includes(asset.type) ||
    ['.htaccess', 'humans.txt', 'robots.txt'].includes(asset.fileName) ||
    asset.url === `${asset.assetGraph.root}favicon.ico`
  ) {
    // Not movable
    return false;
  }

  // Rule for service worker scripts:
  // Must be served from the root domain: https://www.w3.org/TR/service-workers/#origin-relativity
  // Must keep its file name across builds: https://twitter.com/jaffathecake/status/748123748969095168
  // Exclude service workers from file revisioning.
  if (
    asset.type === 'JavaScript' &&
    asset.incomingRelations.some(relation =>
      [
        'JavaScriptServiceWorkerRegistration',
        'HtmlServiceWorkerRegistration',
        'JavaScriptWebWorker'
      ].includes(relation.type)
    )
  ) {
    return false;
  }

  if (
    asset.type === 'Html' &&
    asset.incomingRelations.some(relation =>
      ['HtmlAnchor', 'HtmlMetaRefresh', 'FileRedirect'].includes(relation.type)
    )
  ) {
    return false;
  }

  // Assume that non-inline HTML assets without an <html> element, but with incoming relations
  // are templates that can safely be moved to /static/ even though they're initial
  // (probably the result of loading **/*.html)
  if (
    asset.isInitial &&
    (asset.type !== 'Html' ||
      !asset.isFragment ||
      asset.incomingRelations.length === 0)
  ) {
    return false;
  }

  // Rule for pre-browsing directives where the target asset is not referenced by anything else
  // than that directive:
  // When a user asks the browser to preload an asset and we can't find the usage of said asset,
  // we should assume that the user specified a loading mechanism Assetgraph is not capable
  // of discovering. Moving these assets might break that loading mechanism.
  // Keep asset with only incoming preload directives in place
  if (
    !asset.incomingRelations.some(
      rel => !['HtmlPrefetchLink', 'HtmlPreloadLink'].includes(rel.type)
    )
  ) {
    return false;
  }

  return true;
}

/**
 *
 * @param {(asset: Asset, assetGraph: AssetGraph) => string} newUrlFn
 * @param {AssetGraph} assetGraph
 * @returns {(asset: Asset) => string | undefined}
 */
function createAssetMover(newUrlFn, assetGraph) {
  return asset => {
    let newUrl = newUrlFn(asset, assetGraph);
    if (newUrl) {
      // Keep the old file name, query string and fragment identifier if the new url ends in a slash:
      if (asset.url && /\/$/.test(newUrl)) {
        const matchOldFileNameQueryStringAndFragmentIdentifier = asset.url.match(
          /[^/]*(?:[?#].*)?$/
        );
        if (matchOldFileNameQueryStringAndFragmentIdentifier) {
          newUrl += matchOldFileNameQueryStringAndFragmentIdentifier[0];
        }
      }
      asset.url = newUrl;
    }
  };
}

/**
 * Helper function for determining the order in which the hashes can be computed and the assets
 * moved. The challenge lies in the fact that updating a relation to point at <hash>.<extension>
 * will change the hash of the asset that owns the relation.
 * Needless to say this will fail if the graph of assets to be moved has cycles, so be careful.
 *
 * @generator
 * @param {AssetGraph} assetGraph
 * @yields {Asset[]}
 */
function* generateMoveOrder(assetGraph) {
  /** @type {Map<Asset, Relation[]} */
  const outgoingRelationsByAsset = new Map();

  for (const asset of assetGraph.findAssets({ isInline: false })) {
    if (isAssetSafeToMove(asset)) {
      const relationFrom = assetGraph.collectAssetsPostOrder(asset, {
        to: { isInline: true }
      });
      const relationTo = { isInline: false };
      // Filter source map file relation to prevent possible recursion
      outgoingRelationsByAsset.set(
        asset,
        assetGraph
          .findRelations({
            from: { id: { $in: relationFrom.map(relation => relation.id) } },
            to: relationTo,
            type: { $not: 'SourceMapFile' }
          })
          .filter(relation => relation.to !== asset)
      );
    }
  }

  while (true) {
    if (outgoingRelationsByAsset.size === 0) {
      break;
    }

    /** @type {Asset[]} */
    const currentBatch = [];
    for (const asset of outgoingRelationsByAsset.keys()) {
      if (
        !outgoingRelationsByAsset
          .get(asset)
          .some(outgoingRelation =>
            outgoingRelationsByAsset.has(outgoingRelation.to)
          )
      ) {
        currentBatch.push(asset);
      }
    }

    for (const asset of currentBatch) {
      outgoingRelationsByAsset.delete(asset);
    }

    if (currentBatch.length === 0) {
      throw new Error(
        "Couldn't find a suitable rename order due to cycles in the selection"
      );
    }
    yield* currentBatch;
  }
}

/**
 *
 * @param {AssetGraph} assetGraph
 * @param {(asset: Asset, assetGraph: AssetGraph) => string | string} newUrlFunctionOrString
 */
function moveAssetsInOrder(assetGraph, newUrlFunctionOrString) {
  const assetMover = createAssetMover(newUrlFunctionOrString, assetGraph);
  for (const asset of generateMoveOrder(assetGraph)) {
    assetMover(asset);
  }
}

/**
 * @param {Relation} relation
 * @returns {boolean}
 */
function sourceMapCircleFilter(relation) {
  if (relation.type !== 'SourceMapFile') {
    return true;
  }

  const fromAsset = relation.from;
  const toAsset = relation.to;

  const sourceMapRelations = [
    'JavaScriptSourceMappingUrl',
    'JavaScriptSourceUrl'
  ];

  const hasSourceMapFileCircle = toAsset.outgoingRelations.find(
    rel => sourceMapRelations.includes(rel.type) && rel.to === fromAsset
  );

  return !hasSourceMapFileCircle;
}

/**
 * @param {AssetGraph} assetGraph An AssetGraph instance with all relevant assets already populated
 * @param {object} [options]
 * @param {string} [options.staticDir='static'] Output directory for hashed assets. Relative to the assetgraph root
 * @param {string} [options.cdnRoot] Absolute or protocol-relative URI to the CDN root folder that proxies the assets
 * @param {boolean} [options.cdnFlash=false] Put flash assets on the CDN
 * @param {boolean} [options.cdnHtml=false] Put Html templates on the CDN
 */
module.exports = async function hashfiles(assetGraph, options = {}) {
  const {
    staticDir = 'static',
    cdnRoot,
    cdnFlash = false,
    cdnHtml = false
  } = options;

  moveAssetsInOrder(assetGraph, (asset, assetGraph) => {
    let baseUrl = ensureTrailingSlash(`${assetGraph.root}${staticDir}`);
    // Conservatively assume that all JavaScriptStaticUrl relations pointing at non-images are intended to be fetched via XHR
    // and thus cannot be put on a CDN because of same origin restrictions:
    const hasIncomingJavaScriptStaticUrlOrServiceWorkerRelations =
      assetGraph.findRelations({
        to: asset,
        type: {
          $in: [
            'JavaScriptStaticUrl',
            'JavaScriptServiceWorkerRegistration',
            'HtmlServiceWorkerRegistration'
          ]
        }
      }).length > 0;

    const hasLocalDependencies = assetGraph
      .findRelations({
        from: asset,
        to: {
          isInline: false
        }
      })
      // Don't block on circles between SourceMap and SourceMapFile
      .filter(sourceMapCircleFilter)
      .some(rel => rel.to.url.startsWith(assetGraph.root));

    if (
      cdnRoot &&
      asset.type !== 'Htc' &&
      asset.extension !== '.jar' &&
      (asset.type !== 'Html' || cdnHtml) &&
      (asset.type !== 'Flash' || cdnFlash) &&
      !hasIncomingJavaScriptStaticUrlOrServiceWorkerRelations &&
      !hasLocalDependencies
    ) {
      baseUrl = ensureTrailingSlash(cdnRoot);
      for (const incomingRelation of assetGraph.findRelations({ to: asset })) {
        if (cdnRoot.startsWith('//')) {
          incomingRelation.hrefType = 'protocolRelative';
        } else if (asset.type === 'SourceMap') {
          incomingRelation.hrefType = 'absolute';
        }
        // Set crossorigin=anonymous on <script> tags pointing at CDN JavaScript.
        // See http://blog.errorception.com/2012/12/catching-cross-domain-js-errors.html'
        if (
          (asset.type === 'JavaScript' &&
            incomingRelation.type === 'HtmlScript') ||
          (asset.type === 'Css' && incomingRelation.type === 'HtmlStyle')
        ) {
          incomingRelation.node.setAttribute('crossorigin', 'anonymous');
          incomingRelation.from.markDirty();
        }
      }
    }

    return `${baseUrl}${asset.fileName}${asset.url.replace(/^[^#?]*(?:)/, '')}`;
  });

  moveAssetsInOrder(assetGraph, function(asset) {
    const { url, baseName, extension, md5Hex } = asset;
    return `${baseName}.${md5Hex.substr(0, 10)}${extension}${url.replace(/^[^#?]*(?:)/, '')}`; // Preserve query string and fragment identifier
  });
};
