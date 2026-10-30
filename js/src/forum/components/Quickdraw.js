import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Icon from 'flarum/common/components/Icon';
import ItemList from 'flarum/common/utils/ItemList';
import classList from 'flarum/common/utils/classList';
import extractText from 'flarum/common/utils/extractText';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';

// Things fixed to the bottom of the screen the button must sit above.
const OBSTACLES = [
  '.AlertManager .Alert, .Composer.minimized, .MobileTab-bar, .pl-peek, .pl-dock > *, #bespoke-totop, .Bespoke-toTop, #bespoke-launcher',
  '.CookieBanner, .cc-window, .cc-banner, #onetrust-banner-sdk, #CybotCookiebotDialog, #cookie-banner, .cookie-banner',
  // Parley's chat heads, and the bottom bars of the Concourse and Lobby themes.
  '.pl-heads > *, .ConcourseShell-tabbar, .LobbyShell-dock > *, .LobbyCompose',
].join(', ');

// Fan rings, inside out: radius in px and how many buttons fit on it.
const RINGS = [
  { radius: 96, max: 3 },
  { radius: 168, max: 5 },
];

function t(key, params) {
  return app.translator.trans('ernestdefoe-quickdraw.forum.' + key, params);
}

/*
 * Another extension's control is a <Button icon onclick>label</Button>. Read
 * it into our own shape, so follow, lock, sticky, tags and whatever else a
 * forum runs show up without Quickdraw knowing about them.
 */
function fromButton(vnode, tone) {
  const attrs = vnode && vnode.attrs;
  if (!attrs || typeof attrs.onclick !== 'function' || attrs.disabled || /\bdisabled\b/.test(attrs.className || '')) return null;

  let icon = attrs.icon;
  if (icon && typeof icon === 'object') icon = icon.attrs && icon.attrs.name;
  const label = extractText(vnode.children);
  if (!label) return null;

  return { icon: icon || 'fas fa-circle', label, action: attrs.onclick, tone };
}

export default class Quickdraw extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this.open = false;
  }

  oncreate(vnode) {
    super.oncreate(vnode);

    this.onKey = (e) => {
      if (e.key === 'Escape' && this.open) {
        this.close(true);
        m.redraw();
      }
    };
    this.onMove = () => this.lift();
    document.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.onMove);
    window.addEventListener('scroll', this.onMove, { passive: true });
    this.lift();
  }

  onupdate(vnode) {
    super.onupdate(vnode);
    this.lift();
  }

  onremove(vnode) {
    super.onremove(vnode);
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onMove);
    window.removeEventListener('scroll', this.onMove);
  }

  view() {
    const page = this.attrs.page;
    const discussion = page.discussion;
    const composing = ['normal', 'fullScreen'].includes(app.composer.position);
    const layout = this.expanded || app.forum.attribute('quickdrawLayout') === 'panel' ? 'panel' : 'fan';
    const side = app.forum.attribute('quickdrawSide') === 'left' ? 'left' : 'right';

    if (!discussion || !page.stream || composing) {
      this.open = false;
      return <div className="Quickdraw is-hidden" />;
    }

    const items = this.items(discussion, page.stream).toArray();
    const flagged = items.find((item) => item.itemName === 'flagged');

    return (
      <div
        className={classList('Quickdraw', 'Quickdraw--' + layout, 'Quickdraw--' + side, {
          'is-open': this.open,
          'Quickdraw--phoneOnly': app.forum.attribute('quickdrawScreens') === 'phone',
        })}
      >
        <div className="Quickdraw-scrim" onclick={() => this.close()} />
        {layout === 'fan' ? this.fan(items) : this.panel(items, discussion)}
        <button
          type="button"
          className="Quickdraw-fab"
          aria-expanded={this.open ? 'true' : 'false'}
          aria-controls="quickdraw-menu"
          aria-label={extractText(t(this.open ? 'close' : 'open'))}
          title={extractText(t(this.open ? 'close' : 'open'))}
          // detail is 0 for a keyboard press: only then does focus move into the menu.
          onclick={(e) => (this.open ? this.close(e.detail === 0) : this.show(null, e.detail === 0))}
        >
          <Icon name="fas fa-bolt" className="Quickdraw-fabIcon Quickdraw-fabIcon--open" />
          <Icon name="fas fa-xmark" className="Quickdraw-fabIcon Quickdraw-fabIcon--close" />
          {flagged && !this.open ? <span className="Quickdraw-badge">{flagged.badge}</span> : null}
        </button>
      </div>
    );
  }

  fan(items) {
    const buttons = [];
    let start = 0;

    // The fan holds the everyday actions. Moderation, and anything that
    // doesn't fit, sit behind its last place, which opens the full panel.
    const room = RINGS.reduce((sum, ring) => sum + ring.max, 0);
    const moderation = items.filter((item) => item.tone);
    const actions = items.filter((item) => !item.tone);
    items = actions;
    if (moderation.length || actions.length > room) {
      const flagged = moderation.find((item) => item.itemName === 'flagged');
      items = actions.slice(0, room - 1);
      items.push({
        itemName: 'more',
        icon: moderation.length ? 'fas fa-shield-halved' : 'fas fa-ellipsis',
        label: extractText(t(moderation.length ? 'moderate' : 'more')),
        badge: flagged && flagged.badge,
        tone: moderation.length ? 'moderate' : null,
        action: (e) => {
          this.expanded = true;
          this.show(moderation.length ? '.Quickdraw-section .Quickdraw-item' : null, e.detail === 0);
        },
      });
    }

    RINGS.forEach((ring) => {
      const slice = items.slice(start, start + ring.max);
      slice.forEach((item, i) => {
        // 0° is straight out to the side, 90° straight up.
        const degrees = slice.length === 1 ? 45 : (90 * i) / (slice.length - 1);
        const rad = (degrees * Math.PI) / 180;
        const x = Math.round(ring.radius * Math.cos(rad));
        const y = Math.round(ring.radius * Math.sin(rad));
        // Buttons straight above the main one sit at the screen edge: their label lines up with that edge.
        const edge = x < 40 ? ' Quickdraw-fanItem--edge' : '';
        buttons.push(this.button(item, start + i, 'Quickdraw-fanItem' + edge, { '--qd-x': x + 'px', '--qd-y': y + 'px' }));
      });
      start += ring.max;
    });

    return (
      <div className="Quickdraw-fan" id="quickdraw-menu" role="menu" aria-label={extractText(t('menu_label'))}>
        {buttons}
      </div>
    );
  }

  panel(items, discussion) {
    const actions = items.filter((item) => !item.tone);
    const tiles = actions.slice(0, 4);
    const rows = actions.slice(4);
    const moderation = items.filter((item) => item.tone);

    return (
      <div className="Quickdraw-panel" id="quickdraw-menu" role="menu" aria-label={extractText(t('menu_label'))}>
        <div className="Quickdraw-panelHead">
          <div className="Quickdraw-panelTitle">{discussion.title()}</div>
          <div className="Quickdraw-panelMeta">{t('replies', { count: discussion.replyCount() || 0 })}</div>
        </div>
        <div className="Quickdraw-tiles">{tiles.map((item, i) => this.button(item, i, 'Quickdraw-tile'))}</div>
        {rows.length ? <div className="Quickdraw-rows">{rows.map((item, i) => this.button(item, i + 4, 'Quickdraw-row'))}</div> : null}
        {moderation.length ? (
          <div className="Quickdraw-section">
            <div className="Quickdraw-sectionLabel">{t('moderate')}</div>
            <div className="Quickdraw-rows">{moderation.map((item, i) => this.button(item, i + actions.length, 'Quickdraw-row'))}</div>
          </div>
        ) : null}
      </div>
    );
  }

  button(item, index, className, style = {}) {
    return (
      <button
        type="button"
        role="menuitem"
        key={item.itemName}
        className={classList('Quickdraw-item', className, item.tone && 'Quickdraw-item--' + item.tone, item.primary && 'Quickdraw-item--primary')}
        style={{ '--qd-i': index, ...style }}
        tabindex={this.open ? 0 : -1}
        aria-label={item.badge ? `${item.label} (${item.badge})` : item.label}
        data-label={item.label}
        onclick={(e) => this.run(item, e)}
      >
        <span className="Quickdraw-itemIcon">
          <Icon name={item.icon} />
        </span>
        <span className="Quickdraw-itemLabel">{item.label}</span>
        {item.badge ? <span className="Quickdraw-badge">{item.badge}</span> : null}
      </button>
    );
  }

  items(discussion, stream) {
    const items = new ItemList();
    const user = app.session.user;
    const context = {}; // Not the DiscussionPage, so extensions hand over their plain button forms.

    if (!user || discussion.canReply()) {
      items.add(
        'reply',
        {
          icon: 'fas fa-reply',
          label: extractText(
            app.translator.trans(user ? 'core.forum.discussion_controls.reply_button' : 'core.forum.discussion_controls.log_in_to_reply_button')
          ),
          action: () => DiscussionControls.replyAction.call(discussion, true, false).catch(() => {}),
          primary: true,
        },
        100
      );
    }

    DiscussionControls.userControls(discussion, context)
      .toArray()
      .forEach((vnode, i) => {
        const item = fromButton(vnode);
        // Follow keeps its place by Reply; whatever else extensions add follows our own.
        if (item && vnode.itemName !== 'reply') items.add(vnode.itemName, item, vnode.itemName === 'subscription' ? 95 : 60 - i);
      });

    const lastRead = discussion.lastReadPostNumber();
    const last = discussion.lastPostNumber() || 0;
    if (user && lastRead && lastRead < last) {
      items.add(
        'unread',
        { icon: 'fas fa-bookmark', label: extractText(t('where_left_off')), badge: last - lastRead, action: () => stream.goToNumber(lastRead + 1) },
        90
      );
    }

    const url = window.location.origin + app.route.discussion(discussion);
    items.add(
      'copy',
      {
        icon: 'fas fa-link',
        label: extractText(t('copy_link')),
        action: () =>
          navigator.clipboard?.writeText(url).then(
            () => app.alerts.show({ type: 'success' }, t('link_copied')),
            () => {}
          ),
      },
      85
    );

    if (navigator.share) {
      items.add(
        'share',
        {
          icon: 'fas fa-share-nodes',
          label: extractText(t('share')),
          action: () => navigator.share({ title: discussion.title(), url }).catch(() => {}),
        },
        80
      );
    }

    items.add('first', { icon: 'fas fa-angles-up', label: extractText(t('first_post')), action: () => stream.goToFirst() }, 75);
    items.add('last', { icon: 'fas fa-angles-down', label: extractText(t('last_post')), action: () => stream.goToLast() }, 70);

    // Moderators and admins. Flags come with the posts already on the page,
    // so counting them costs nothing.
    if ('flarum-flags' in (flarum.extensions || {}) && app.forum.attribute('canViewFlags')) {
      const posts = app.store
        .all('posts')
        .filter((post) => post.discussion() === discussion && post.flags && (post.flags() || []).length)
        .sort((a, b) => a.number() - b.number());

      if (posts.length) {
        items.add(
          'flagged',
          {
            icon: 'fas fa-flag',
            label: extractText(t('flagged_posts')),
            badge: posts.length,
            tone: 'moderate',
            action: () => stream.goToNumber(posts[0].number()),
          },
          50
        );
      }
    }

    [
      ['moderation', 'moderate', 40],
      ['destructive', 'danger', 20],
    ].forEach(([section, tone, priority]) => {
      DiscussionControls[section + 'Controls'](discussion, context)
        .toArray()
        .forEach((vnode, i) => {
          const item = fromButton(vnode, tone);
          if (item && !items.has(vnode.itemName)) items.add(vnode.itemName, item, priority - i);
        });
    });

    return items;
  }

  show(focus, keyboard = true) {
    this.open = true;
    if (!keyboard) return;
    setTimeout(() => {
      const target = (focus && this.element?.querySelector(focus)) || this.element?.querySelector('.Quickdraw-item');
      target?.focus({ preventScroll: true });
      if (focus) target?.scrollIntoView({ block: 'nearest' });
    }, 60);
  }

  close(refocus) {
    this.open = false;
    this.expanded = false;
    if (refocus) this.element?.querySelector('.Quickdraw-fab')?.focus({ preventScroll: true });
  }

  run(item, e) {
    this.close();
    item.action(e);
  }

  // Lift the button above whatever else is fixed to the bottom of the screen
  // in its column. Written straight to the element: no redraw.
  lift() {
    const el = this.element;
    const fab = el && el.querySelector('.Quickdraw-fab');
    if (!fab) return;

    const box = fab.getBoundingClientRect();
    let lift = 0;
    document.querySelectorAll(OBSTACLES).forEach((node) => {
      const r = node.getBoundingClientRect();
      if (!r.width || !r.height || r.top < window.innerHeight / 2 || getComputedStyle(node).visibility === 'hidden') return;
      if (r.right <= box.left || r.left >= box.right) return;
      lift = Math.max(lift, window.innerHeight - r.top);
    });

    const value = lift + 'px';
    if (el.style.getPropertyValue('--qd-lift') !== value) el.style.setProperty('--qd-lift', value);
  }
}
