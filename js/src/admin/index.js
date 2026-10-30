import app from 'flarum/admin/app';

app.initializers.add('ernestdefoe-quickdraw', () => {
  const t = (key) => app.translator.trans('ernestdefoe-quickdraw.admin.' + key);
  const options = (key, values) => Object.fromEntries(values.map((value) => [value, t(key + '.' + value)]));

  app.registry
    .for('ernestdefoe-quickdraw')
    .registerSetting({
      setting: 'ernestdefoe-quickdraw.layout',
      type: 'select',
      label: t('layout_label'),
      help: t('layout_help'),
      options: options('layout', ['fan', 'panel']),
      default: 'fan',
    })
    .registerSetting({
      setting: 'ernestdefoe-quickdraw.screens',
      type: 'select',
      label: t('screens_label'),
      options: options('screens', ['all', 'phone']),
      default: 'all',
    })
    .registerSetting({
      setting: 'ernestdefoe-quickdraw.side',
      type: 'select',
      label: t('side_label'),
      options: options('side', ['right', 'left']),
      default: 'right',
    });
});
