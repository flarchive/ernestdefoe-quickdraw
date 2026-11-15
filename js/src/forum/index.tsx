import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import Quickdraw from './components/Quickdraw';

/*
 * The button lives in its own root on <body>, so a theme that transforms or
 * clips the page column can't trap a fixed element inside it. It exists only
 * while a discussion page does.
 */
app.initializers.add('ernestdefoe-quickdraw', () => {
  extend('flarum/forum/components/DiscussionPage', 'oncreate', function () {
    const root = document.createElement('div');
    root.className = 'Quickdraw-root';
    document.body.appendChild(root);
    this.quickdrawRoot = root;
    m.mount(root, { view: () => <Quickdraw page={this} /> });
  });

  extend('flarum/forum/components/DiscussionPage', 'onremove', function () {
    if (!this.quickdrawRoot) return;
    m.mount(this.quickdrawRoot, null);
    this.quickdrawRoot.remove();
    this.quickdrawRoot = null;
  });
});
