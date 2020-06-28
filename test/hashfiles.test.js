const { resolve } = require('path');
const expect = require('unexpected')
  .clone()
  .use(require('unexpected-assetgraph'))
  .use(require('unexpected-dom'));
const AssetGraph = require('assetgraph');
const hashFiles = require('../lib/hashfiles');

async function getPopulatedGraph(root, entryPoints) {
  const graph = new AssetGraph({
    root: resolve(__dirname, '../testdata', root)
  });

  await graph.loadAssets(entryPoints);
  await graph.populate({
    followRelations: {
      crossorigin: false,
      type: { $nin: ['JavaScriptFetch', 'SourceMapSource', 'SourceMapFile'] }
    }
  });

  return graph;
}

describe('hashfiles', () => {
  describe('with default options', () => {
    it('should keep entrypoints unhashed', async () => {
      const graph = await getPopulatedGraph('entrypoints', [
        'index.html',
        '404.html',
        '500.html',
        'turtle.jpg'
      ]);

      await hashFiles(graph);

      expect(graph.findAssets(), 'to satisfy', [
        { fileName: 'index.html' },
        { fileName: '404.html' },
        { fileName: '500.html' },
        { fileName: 'turtle.jpg' }
      ]);
    });

    it('should keep html with incoming anchors unhashed', async () => {
      const graph = await getPopulatedGraph('links', ['index.html']);

      await hashFiles(graph);

      expect(graph.findAssets(), 'to satisfy', [
        { path: '/', fileName: 'index.html' },
        { path: '/', fileName: 'page1.html' },
        { path: '/page2/', fileName: 'index.html' }
      ]);
    });

    it('should keep cache manifests unhashed', async () => {
      const graph = await getPopulatedGraph('cachemanifest', ['index.html']);

      await hashFiles(graph);

      expect(graph.findAssets(), 'to satisfy', [
        { path: '/', fileName: 'index.html' },
        { path: '/', fileName: 'douchebag.appcache' }
      ]);
    });

    it('should keep RSS and Atom feeds unhashed', async () => {
      const graph = await getPopulatedGraph('feeds', ['index.html']);

      await hashFiles(graph);

      expect(graph.findAssets({ isInline: false }), 'to satisfy', [
        { path: '/', fileName: 'index.html' },
        { path: '/', fileName: 'rss.xml' },
        { path: '/', fileName: 'atom.xml' }
      ]);
    });

    it('should keep .htaccess unhashed', async () => {
      const graph = await getPopulatedGraph('htaccess', ['index.html']);

      await hashFiles(graph);

      expect(graph.findAssets(), 'to satisfy', [
        { fileName: 'index.html' },
        { fileName: '.htaccess' }
      ]);
    });

    it('should keep humans.txt and robots.txt unhashed', async () => {
      const graph = await getPopulatedGraph('txtfiles', ['index.html']);

      await hashFiles(graph);

      expect(graph.findAssets(), 'to satisfy', [
        { fileName: 'index.html' },
        { fileName: 'robots.txt' },
        { fileName: 'humans.txt' }
      ]);
    });

    it('should keep /favicon.ico unhashed', async () => {
      const graph = await getPopulatedGraph('favicon', ['index.html']);

      await hashFiles(graph);

      expect(graph.findAssets(), 'to satisfy', [
        { fileName: 'index.html' },
        { fileName: 'favicon.ico' }
      ]);
    });

    it('should keep serviceworkers unhashed', async () => {
      const graph = await getPopulatedGraph('serviceworker', ['index.html']);

      await hashFiles(graph);

      expect(graph.findAssets({ isInline: false }), 'to satisfy', [
        { fileName: 'index.html' },
        { fileName: 'sw.js' }
      ]);
    });

    it('should keep preloaded assets that have no other incoming relation unhashed', async () => {
      const graph = await getPopulatedGraph('unreferenced-preload', [
        'index.html'
      ]);

      await hashFiles(graph);

      expect(graph.findAssets({ isInline: false }), 'to satisfy', [
        { fileName: 'index.html' },
        { fileName: 'page-data.json' },
        { fileName: 'page-data-2.cabd62c27f.json' }
      ]);
    });

    it('should hash static assets', async () => {
      const graph = new AssetGraph({
        root: resolve(__dirname, '../testdata', 'fullpage'),
        canonicalRoot: 'https://mntr.dk/'
      });

      await graph.loadAssets('index.html');
      await graph.populate({
        followRelations: {
          crossorigin: false,
          type: { $not: 'HtmlAnchor' }
        }
      });

      await hashFiles(graph);

      const unhashedAssets = graph.findAssets({
        isInline: false,
        isLoaded: true,
        isRedirect: false,
        type: { $in: ['Html', 'Atom', 'Ico'] }
      });

      const hashedAssets = graph
        .findAssets({
          isInline: false,
          isLoaded: true,
          isRedirect: false
        })
        .filter(asset => !unhashedAssets.includes(asset));

      expect(unhashedAssets, 'to satisfy', [
        { path: '/', fileName: 'index.html' },
        { path: '/', fileName: 'favicon.ico' },
        { path: '/', fileName: 'feed.xml' }
      ]);

      expect(hashedAssets, 'to satisfy', [
        { path: '/static/', fileName: 'main.d35efae1d2.css' },
        { path: '/static/', fileName: 'syntax.8a0ad6441f.css' },
        { path: '/static/', fileName: '152.6f37a55225.png' },
        { path: '/static/', fileName: '144.0366d33047.png' },
        { path: '/static/', fileName: '120.5f5ca8450f.png' },
        { path: '/static/', fileName: '114.fe7da9d5c4.png' },
        { path: '/static/', fileName: '72.df76c12a80.png' },
        { path: '/static/', fileName: '57.6593084d25.png' },
        { path: '/static/', fileName: '32.68acab84b2.png' },
        { path: '/static/', fileName: '16.787eba6fe7.png' },
        { path: '/static/', fileName: 'opengraph.4d21487d57.png' },
        { path: '/static/', fileName: 'logo-white.0b1467f089.svg' },
        { path: '/static/', fileName: 'munter.dafe8ca340.jpg' },
        { path: '/static/', fileName: 'web-share.e6195970d6.js' },
        { path: '/static/', fileName: 'social-twitter.c359540fc8.svg' },
        { path: '/static/', fileName: 'social-github.89959ef390.svg' },
        { path: '/static/', fileName: 'social-gplus.5223e7bc73.svg' },
        { path: '/static/', fileName: 'social-linkedin.757b73159a.svg' },
        { path: '/static/', fileName: 'social-email.487543e65c.svg' },
        { path: '/static/', fileName: 'social-feed.ad4bea7819.svg' }
      ]);

      expect(unhashedAssets[0], 'to satisfy', {
        text: expect
          .it('to contain', 'main.d35efae1d2.css')
          .and('to contain', 'syntax.8a0ad6441f.css')
      });
    });

    it('should retain query strings on hashed assets', async () => {
      const graph = await getPopulatedGraph('querystring', ['index.html']);

      await hashFiles(graph);

      expect(graph.findAssets()[0], 'to satisfy', {
        fileName: 'index.html',
        outgoingRelations: [
          {
            href: 'static/main.6bc5650065.css?foo=bar',
            to: {
              path: '/static/',
              fileName: 'main.6bc5650065.css',
              query: { foo: 'bar' }
            }
          }
        ]
      });
    });
  });

  describe('with staticDir option', () => {
    it('should put hashed assets in /__mydir', async () => {
      const graph = new AssetGraph({
        root: resolve(__dirname, '../testdata', 'fullpage'),
        canonicalRoot: 'https://mntr.dk/'
      });

      await graph.loadAssets('index.html');
      await graph.populate({
        followRelations: {
          crossorigin: false,
          type: { $not: 'HtmlAnchor' }
        }
      });

      await hashFiles(graph, { staticDir: '__mydir' });

      const unhashedAssets = graph.findAssets({
        isInline: false,
        isLoaded: true,
        isRedirect: false,
        type: { $in: ['Html', 'Atom', 'Ico'] }
      });

      const hashedAssets = graph
        .findAssets({
          isInline: false,
          isLoaded: true,
          isRedirect: false
        })
        .filter(asset => !unhashedAssets.includes(asset));

      expect(unhashedAssets, 'to satisfy', [
        { path: '/', fileName: 'index.html' },
        { path: '/', fileName: 'favicon.ico' },
        { path: '/', fileName: 'feed.xml' }
      ]);

      expect(hashedAssets, 'to satisfy', [
        { path: '/__mydir/', fileName: 'main.d35efae1d2.css' },
        { path: '/__mydir/', fileName: 'syntax.8a0ad6441f.css' },
        { path: '/__mydir/', fileName: '152.6f37a55225.png' },
        { path: '/__mydir/', fileName: '144.0366d33047.png' },
        { path: '/__mydir/', fileName: '120.5f5ca8450f.png' },
        { path: '/__mydir/', fileName: '114.fe7da9d5c4.png' },
        { path: '/__mydir/', fileName: '72.df76c12a80.png' },
        { path: '/__mydir/', fileName: '57.6593084d25.png' },
        { path: '/__mydir/', fileName: '32.68acab84b2.png' },
        { path: '/__mydir/', fileName: '16.787eba6fe7.png' },
        { path: '/__mydir/', fileName: 'opengraph.4d21487d57.png' },
        { path: '/__mydir/', fileName: 'logo-white.0b1467f089.svg' },
        { path: '/__mydir/', fileName: 'munter.dafe8ca340.jpg' },
        { path: '/__mydir/', fileName: 'web-share.e6195970d6.js' },
        { path: '/__mydir/', fileName: 'social-twitter.c359540fc8.svg' },
        { path: '/__mydir/', fileName: 'social-github.89959ef390.svg' },
        { path: '/__mydir/', fileName: 'social-gplus.5223e7bc73.svg' },
        { path: '/__mydir/', fileName: 'social-linkedin.757b73159a.svg' },
        { path: '/__mydir/', fileName: 'social-email.487543e65c.svg' },
        { path: '/__mydir/', fileName: 'social-feed.ad4bea7819.svg' }
      ]);
    });
  });

  describe('with cdnRoot option', () => {
    it('should put hashed assets in /myCdnRoot', async () => {
      const graph = await getPopulatedGraph('cdntest', ['index.html']);

      await hashFiles(graph, { cdnRoot: 'https://mycdn.com' });

      const allFileAssets = graph
        .findAssets({
          isLoaded: true,
          isInline: false
        })
        .sort((a, b) => a.fileName.localeCompare(b.fileName));

      expect(allFileAssets, 'to satisfy', [
        {
          origin: 'file://',
          path: '/static/',
          fileName: 'foo.34aa4278e7.jar'
        },
        {
          origin: 'file://',
          path: '/static/',
          fileName: 'foo.d41d8cd98f.swf'
        },
        {
          origin: 'file://',
          path: '/',
          fileName: 'index.html'
        },
        {
          origin: 'file://',
          path: '/static/',
          fileName: 'main.cd90e77c46.js'
        },
        {
          origin: 'file://',
          path: '/static/',
          fileName: 'main.js.71801f227c.map'
        },
        {
          origin: 'file://',
          path: '/static/',
          fileName: 'main.tpl.a8b2526ad6.html'
        },
        {
          origin: 'https://mycdn.com',
          path: '/',
          fileName: 'simple.3831d504d8.js'
        },
        {
          origin: 'https://mycdn.com',
          path: '/',
          fileName: 'simple.829e4ff717.css'
        },
        {
          origin: 'file://',
          path: '/static/',
          fileName: 'style.c3a9d85076.css'
        },
        {
          origin: 'file://',
          path: '/',
          fileName: 'sw.js'
        },
        {
          origin: 'file://',
          path: '/static/',
          fileName: 'theBehavior.31de722f4d.htc'
        },
        {
          origin: 'https://mycdn.com',
          path: '/',
          fileName: 'theScript.0d6f8b103e.js'
        },
        {
          origin: 'https://mycdn.com',
          path: '/',
          fileName: 'turtle.d70f0a4958.jpg'
        }
      ]);
    });

    it('should put hashed sourcemaps /myCdnRoot', async () => {
      const graph = new AssetGraph({
        root: resolve(__dirname, '../testdata', 'sourcemapCdn')
      });

      await graph.loadAssets(['index.html']);
      await graph.populate({
        followRelations: {
          crossorigin: false
        }
      });

      await hashFiles(graph, { cdnRoot: 'https://mycdn.com' });

      const allFileAssets = graph
        .findAssets({
          isLoaded: true,
          isInline: false
        })
        .sort((a, b) => a.fileName.localeCompare(b.fileName));

      expect(allFileAssets, 'to satisfy', [
        {
          origin: 'file://',
          path: '/',
          fileName: 'index.html'
        },
        {
          origin: 'https://mycdn.com',
          path: '/',
          fileName: 'main.6955839b28.js'
        },
        {
          origin: 'https://mycdn.com',
          path: '/',
          fileName: 'main.c1453512ae.coffee'
        },
        {
          origin: 'https://mycdn.com',
          path: '/',
          fileName: 'main.js.07d32556c8.map'
        }
      ]);

      expect(graph, 'to contain relation', {
        to: { type: 'SourceMap' },
        hrefType: 'absolute'
      });
    });

    it('should put crossorigin attributes on HtmlRelations to CDN assets', async () => {
      const graph = await getPopulatedGraph('cdntest', ['index.html']);

      await hashFiles(graph, { cdnRoot: 'https://mycdn.com' });

      expect(
        graph.findRelations({
          from: { fileName: 'index.html' },
          type: { $in: ['HtmlScript', 'HtmlStyle'] },
          to: { isInline: false }
        }),
        'to satisfy',
        [
          {
            type: 'HtmlStyle',
            href: 'https://mycdn.com/simple.829e4ff717.css',
            crossorigin: true,
            node: expect.it('to have attribute', 'crossorigin')
          },
          {
            type: 'HtmlStyle',
            href: 'static/style.c3a9d85076.css',
            crossorigin: false,
            node: expect.it('not to have attribute', 'crossorigin')
          },
          {
            type: 'HtmlScript',
            href: 'https://mycdn.com/simple.3831d504d8.js',
            crossorigin: true,
            node: expect.it('to have attribute', 'crossorigin')
          },
          {
            type: 'HtmlScript',
            href: 'static/main.cd90e77c46.js',
            crossorigin: false,
            node: expect.it('not to have attribute', 'crossorigin')
          }
        ]
      );
    });

    it('should have protocol-relative hreftypes to CDN assets', async () => {
      const graph = await getPopulatedGraph('cdntest', ['index.html']);

      await hashFiles(graph, { cdnRoot: '//mycdn.com' });

      expect(
        graph.findRelations({
          crossorigin: true
        }),
        'to have items satisfying',
        {
          hrefType: 'protocolRelative'
        }
      );
    });

    describe('with cdnFlash option', () => {
      it('should move Flash assets to the CDN', async () => {
        const graph = await getPopulatedGraph('cdntest', ['index.html']);

        await hashFiles(graph, {
          cdnRoot: 'https://mycdn.com',
          cdnFlash: true
        });

        const flashAssets = graph.findAssets({
          isLoaded: true,
          isInline: false,
          type: 'Flash'
        });

        expect(flashAssets, 'to satisfy', [
          {
            origin: 'https://mycdn.com',
            path: '/',
            fileName: 'foo.d41d8cd98f.swf'
          }
        ]);
      });
    });

    describe('with cdnHtml option', () => {
      it.skip('should move Html assets to the CDN', async () => {
        const graph = await getPopulatedGraph('cdntest', ['index.html']);

        await hashFiles(graph, {
          cdnRoot: 'https://mycdn.com',
          cdnHtml: true
        });

        const htmlFragments = graph.findAssets({
          isLoaded: true,
          isInline: false,
          type: 'Html',
          isFragment: true
        });

        expect(htmlFragments, 'to satisfy', [
          {
            origin: 'https://mycdn.com',
            path: '/',
            fileName: 'main.tpl.a8b2526ad6.html'
          }
        ]);
      });
    });
  });
});
