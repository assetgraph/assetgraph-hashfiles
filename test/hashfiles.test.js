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
  await graph.populate();

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

    it('should keep /favicon.ico unhashed');
    it('should keep serviceworkers unhashed');

    it('should hash static assets');
  });

  describe('with staticDir option', () => {
    it('should put hashed assets in /__mydir');
  });

  describe('with cdnRoot option', () => {
    it('should put hashed assets in /myCdnRoot');

    describe('with cdnFlash option', () => {});

    describe('with cdnHtml option', () => {});
  });
});
