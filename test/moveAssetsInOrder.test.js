const expect = require('unexpected')
  .clone()
  .use(require('unexpected-sinon'))
  .use(require('unexpected-set'));
const sinon = require('sinon');
const AssetGraph = require('assetgraph');
const moveAssetsInOrder = require('../lib/moveAssetsInOrder');

describe('moveAssetsInOrder', function() {
  it('should visit assets in the correct order', async function() {
    const order = ['first.css', 'second.css', 'third.css', 'main.css'];
    let idx = 0;

    const assetGraph = new AssetGraph({
      root: 'testdata/moveAssetsInOrder/'
    });
    await assetGraph.loadAssets('index.html');
    await assetGraph.populate();

    await moveAssetsInOrder(assetGraph, function(asset) {
      expect(asset.fileName, 'to be', order[idx]);
      idx += 1;
    });
  });

  it('should emit an error when encountering circular references', async function() {
    const assetGraph = new AssetGraph({
      root: 'testdata/moveAssetsInOrder/'
    });

    const spy = sinon.spy();
    assetGraph.on('warn', spy);

    await assetGraph.loadAssets('partiallycircular.html');
    await assetGraph.populate();
    await moveAssetsInOrder(assetGraph, function() {});

    expect(spy, 'to have calls satisfying', () => {
      spy({
        message:
          'moveAssetsInOrder: Cyclic dependencies detected. All files could not be moved',
        relations: expect.it('with set semantics', 'to satisfy', [
          {
            from: {
              fileName: 'circular-base.css'
            },
            href: 'circular-child.css'
          },
          {
            from: {
              fileName: 'circular-child.css'
            },
            href: 'circular-base.css'
          }
        ])
      });
    });
  });
});
