/**
 * @param {AssetGraph} assetGraph An AssetGraph instance with all relevant assets already populated
 * @param {object} [options]
 * @param {string} [options.staticDir='static']
 * @param {string} [options.cdnRoot='']
 * @param {boolean} [options.cdnFlash=false]
 * @param {boolean} [options.cdnHtml=false]
 */
module.exports = async function hashfiles(assetGraph, options = {}) {
  const {
    staticDir = 'static',
    cdnRoot = '',
    cdnFlash = false,
    cdnHtml = false
  } = options;

  const moveAssetsInOrderQuery = {
    $and: [
      {
        isLoaded: true,
        isRedirect: false,
        isInline: false,
        type: { $nin: ['CacheManifest', 'Rss', 'Atom'] },
        fileName: { $nin: ['.htaccess', 'humans.txt', 'robots.txt'] }
      },
      {
        url: { $not: `${assetGraph.root}favicon.ico` }
      },

      // Rule for service worker scripts:
      // Must be served from the root domain: https://www.w3.org/TR/service-workers/#origin-relativity
      // Must keep its file name across builds: https://twitter.com/jaffathecake/status/748123748969095168
      // Exclude service workers from file revisioning.
      {
        $not: {
          type: 'JavaScript',
          incomingRelations: {
            $elemMatch: {
              type: {
                $in: [
                  'JavaScriptServiceWorkerRegistration',
                  'HtmlServiceWorkerRegistration',
                  'JavaScriptWebWorker'
                ]
              }
            }
          }
        }
      },
      {
        $not: {
          type: 'Html',
          incomingRelations: {
            $elemMatch: {
              type: {
                $in: ['HtmlAnchor', 'HtmlMetaRefresh', 'FileRedirect']
              }
            }
          }
        }
      },
      {
        $or: [
          { $not: { isInitial: true } },
          // Assume that non-inline HTML assets without an <html> element, but with incoming relations
          // are templates that can safely be moved to /static/ even though they're initial
          // (probably the result of loading **/*.html)
          {
            type: 'Html',
            isFragment: true,
            incomingRelations: { $not: { $size: 0 } }
          }
        ]
      }
    ]
  };

  await assetGraph.moveAssetsInOrder(
    moveAssetsInOrderQuery,
    (asset, assetGraph) => {
      let baseUrl = `${assetGraph.root}${staticDir}/`;
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
      if (
        (cdnRoot &&
          asset.type !== 'Htc' &&
          asset.extension !== '.jar' &&
          (asset.type !== 'Html' || cdnHtml) &&
          (asset.isImage ||
            !hasIncomingJavaScriptStaticUrlOrServiceWorkerRelations)) ||
        (cdnRoot && cdnFlash && asset.type === 'Flash')
      ) {
        baseUrl = cdnRoot;
        assetGraph
          .findRelations({ to: asset })
          .forEach(function(incomingRelation) {
            if (/^\/\//.test(cdnRoot)) {
              incomingRelation.hrefType = 'protocolRelative';
            } else if (
              (asset.type === 'SourceMap' ||
                hasIncomingJavaScriptStaticUrlOrServiceWorkerRelations) &&
              /^https?:/.test(cdnRoot)
            ) {
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
          });
      }
      return baseUrl + asset.fileName;
    }
  );

  await assetGraph.moveAssetsInOrder(moveAssetsInOrderQuery, function(asset) {
    const { url, baseName, extension, md5Hex } = asset;
    return `${baseName}.${md5Hex.substr(0, 10)}${extension}${url.replace(/^[^#?]*(?:)/, '')}`; // Preserve query string and fragment identifier
  });
};
