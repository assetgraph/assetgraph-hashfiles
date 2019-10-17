const { resolve } = require('path');
const expect = require('unexpected')
  .clone()
  .use(require('unexpected-assetgraph'));
const AssetGraph = require('assetgraph');
const hashFiles = require('../lib/hashfiles');

async function getPopulatedGraph(root, entryPoints) {
  const graph = new AssetGraph({
    root: resolve(__dirname, '../testdata', root)
  });

  await graph.loadAssets(entryPoints);
  await graph.populate({
    followRelations: {
      crossOrigin: false
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

      const hasshedAssets = graph
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

      expect(hasshedAssets, 'to satisfy', [
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

      const hasshedAssets = graph
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

      expect(hasshedAssets, 'to satisfy', [
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

      await hashFiles(graph);

      const allFileAssets = graph.findAssets({
        isLoaded: true,
        isInline: false
      });

      expect(allFileAssets, 'to satisfy', []);
    });

    describe('with cdnFlash option', () => {});

    describe('with cdnHtml option', () => {});
  });
});
