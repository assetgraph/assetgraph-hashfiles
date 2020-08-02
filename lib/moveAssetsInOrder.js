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

  // Create map of file-assets and their relations to other file-assets
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

  while (outgoingRelationsByAsset.size > 0) {
    /** @type {Asset[]} */
    const currentBatch = [];
    // Find batches of assets that point to no other files in the map
    for (const [
      asset,
      outgoingRelations
    ] of outgoingRelationsByAsset.entries()) {
      if (
        !outgoingRelations.some(outgoingRelation =>
          outgoingRelationsByAsset.has(outgoingRelation.to)
        )
      ) {
        currentBatch.push(asset);
      }
    }

    // Remove assets in current batch from file-asset map
    for (const asset of currentBatch) {
      outgoingRelationsByAsset.delete(asset);
    }

    // There are assets left in the map which have relations to other
    // assets in the map.
    // At this point that can only happen if there is one or more
    // dependency circles in the graph represented by the remaining
    // map of assets
    if (currentBatch.length === 0) {
      const warning = new Error(
        'moveAssetsInOrder: Cyclic dependencies detected. All files could not be moved'
      );

      const relevantRelations = []
        .concat(...outgoingRelationsByAsset.values())
        .filter(relation => outgoingRelationsByAsset.has(relation.to));

      warning.relations = relevantRelations;
      assetGraph.emit('warn', warning);

      return;
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

module.exports = moveAssetsInOrder;
