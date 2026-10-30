<?php

/*
 * Quickdraw — a floating action button for discussion pages.
 *
 * Everything happens in the browser: the menu is built from the discussion
 * page's own controls, so the server only carries three settings.
 */

use Flarum\Extend;

return [
    (new Extend\Frontend('forum'))
        ->js(__DIR__.'/js/dist/forum.js')
        ->css(__DIR__.'/less/forum.less'),

    (new Extend\Frontend('admin'))
        ->js(__DIR__.'/js/dist/admin.js'),

    new Extend\Locales(__DIR__.'/locale'),

    (new Extend\Settings())
        ->default('ernestdefoe-quickdraw.layout', 'fan')
        ->default('ernestdefoe-quickdraw.screens', 'all')
        ->default('ernestdefoe-quickdraw.side', 'right')
        ->serializeToForum('quickdrawLayout', 'ernestdefoe-quickdraw.layout')
        ->serializeToForum('quickdrawScreens', 'ernestdefoe-quickdraw.screens')
        ->serializeToForum('quickdrawSide', 'ernestdefoe-quickdraw.side'),
];
