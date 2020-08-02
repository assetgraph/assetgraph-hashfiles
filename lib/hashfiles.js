const { ensureTrailingSlash } = require('urltools');
const moveAssetsInOrder = require('./moveAssetsInOrder');

/** @typedef {import('assetgraph')} AssetGraph */
/** @typedef {import('assetgraph/lib/assets/Asset')} Asset */
/** @typedef {import('assetgraph/lib/relations/Relation')} Relation */

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
