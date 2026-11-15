import app from 'flarum/forum/app';
import Component, { type ComponentAttrs } from 'flarum/common/Component';
import Icon from 'flarum/common/components/Icon';
import ItemList from 'flarum/common/utils/ItemList';
import classList from 'flarum/common/utils/classList';
import extractText from 'flarum/common/utils/extractText';
import DiscussionControls from 'flarum/forum/utils/DiscussionControls';
import type Mithril from 'mithril';
import type Discussion from 'flarum/common/models/Discussion';
import type DiscussionPage from 'flarum/forum/components/DiscussionPage';
import type PostStreamState from 'flarum/forum/states/PostStreamState';
import type Post from 'flarum/common/models/Post';

// The DiscussionPage it belongs to; the two fields read here are protected in core's typings.
interface PageState {
  discussion?: Discussion | null;
  stream?: PostStreamState | null;
}

export interface QuickdrawAttrs extends ComponentAttrs {
  page: DiscussionPage;
}

type Tone = 'moderate' | 'danger';
type ListedItem = Item & { itemName: string };

interface Item {
  itemName?: string;
  icon: string;
  label: string;
  action: (e: MouseEvent) => unknown;
  tone?: Tone | null;
  badge?: number;
  primary?: boolean;
}

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

function t(key: string, params: Record<string, string | number> = {}) {
  return app.translator.trans('ernestdefoe-quickdraw.forum.' + key, params);
}

// The Clipboard API needs https and can be refused, so fall back to the old
// copy command, and as a last resort show the link to copy by hand.
function copy(url: string) {
  const done = () => app.alerts.show({ type: 'success' }, t('link_copied'));
  const legacy = () => {
    const field = document.createElement('textarea');
    field.value = url;
    field.readOnly = true;
    field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, url.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      // ok stays false, so the error alert below still hands over the link.
      console.warn('Quickdraw: copy command failed', e);
    }
    field.remove();
    if (ok) done();
    else app.alerts.show({ type: 'error' }, t('copy_failed', { url }));
  };

  if (window.isSecureContext && navigator.clipboard) navigator.clipboard.writeText(url).then(done, legacy);
  else legacy();
}

/*
 * Another extension's control is a <Button icon onclick>label</Button>. Read
 * it into our own shape, so follow, lock, sticky, tags and whatever else a
 * forum runs show up without Quickdraw knowing about them.
 */
function fromButton(vnode: any, tone?: Tone): Item | null {
  const attrs = vnode && vnode.attrs;
  if (!attrs || typeof attrs.onclick !== 'function' || attrs.disabled || /\bdisabled\b/.test(attrs.className || '')) return null;

  let icon = attrs.icon;
  if (icon && typeof icon === 'object') icon = icon.attrs && icon.attrs.name;
  const label = extractText(vnode.children);
  if (!label) return null;

  return { icon: icon || 'fas fa-circle', label, action: attrs.onclick, tone };
}

export default class Quickdraw extends Component<QuickdrawAttrs> {
  open = false;
  expanded = false;
  shown = false;
  wasShown?: boolean;
  frame = 0;
  observer?: MutationObserver;
  onKey!: (e: KeyboardEvent) => void;
  onSettle!: (e: Event) => void;
  queue!: () => void;

  oninit(vnode: Mithril.Vnode<QuickdrawAttrs, this>) {
    super.oninit(vnode);
    this.open = false;
  }

  oncreate(vnode: Mithril.VnodeDOM<QuickdrawAttrs, this>) {
    super.oncreate(vnode);

    this.onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.open) {
        this.close(true);
        m.redraw();
      }
    };
    // Measure at most once a frame, and only when something outside the
    // button changed: an alert, the composer, a cookie banner, another
    // extension's bar, or the Mobile Tab bar sliding away (a class change).
    // A redraw that leaves the page as it was costs nothing. Fixed bars
    // don't move on scroll, so scrolling alone doesn't measure either.
    this.queue = () => {
      if (!this.frame) this.frame = requestAnimationFrame(() => ((this.frame = 0), this.lift()));
    };
    // The scrubber and the posts change on every scroll and never hold a bar.
    const outside = (node: Node) =>
      !(this.element && this.element.contains(node)) &&
      !((node.nodeType === 1 ? node : node.parentNode) as Element | null)?.closest?.('.PostStreamScrubber, .PostStream');
    this.observer = new MutationObserver((records) => records.some((record) => outside(record.target)) && this.queue());
    this.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    // A bar that slides or fades in has its final place once it settles.
    this.onSettle = (e: Event) => outside(e.target as Node) && this.queue();
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('transitionend', this.onSettle, true);
    document.addEventListener('animationend', this.onSettle, true);
    window.addEventListener('resize', this.queue);
    this.lift();
  }

  onupdate(vnode: Mithril.VnodeDOM<QuickdrawAttrs, this>) {
    super.onupdate(vnode);
    // The button itself just came back (the composer closed, the posts loaded).
    if (this.shown !== this.wasShown) this.queue();
    this.wasShown = this.shown;
  }

  onremove(vnode: Mithril.VnodeDOM<QuickdrawAttrs, this>) {
    super.onremove(vnode);
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('transitionend', this.onSettle, true);
    document.removeEventListener('animationend', this.onSettle, true);
    window.removeEventListener('resize', this.queue);
  }

  view() {
    const page = this.attrs.page as unknown as PageState;
    const discussion = page.discussion;
    const composing = ['normal', 'fullScreen'].includes(app.composer.position);
    const layout = this.expanded || app.forum.attribute('quickdrawLayout') === 'panel' ? 'panel' : 'fan';
    const side = app.forum.attribute('quickdrawSide') === 'left' ? 'left' : 'right';

    this.shown = !!(discussion && page.stream && !composing);
    if (!discussion || !page.stream || !this.shown) {
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
          onclick={(e: MouseEvent) => (this.open ? this.close(e.detail === 0) : this.show(null, e.detail === 0))}
        >
          <Icon name="fas fa-bolt" className="Quickdraw-fabIcon Quickdraw-fabIcon--open" />
          <Icon name="fas fa-xmark" className="Quickdraw-fabIcon Quickdraw-fabIcon--close" />
          {flagged && !this.open ? <span className="Quickdraw-badge">{flagged.badge}</span> : null}
        </button>
      </div>
    );
  }

  fan(items: Item[]) {
    const buttons: Mithril.Children[] = [];
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
        action: (e: MouseEvent) => {
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

  panel(items: Item[], discussion: Discussion) {
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

  button(item: Item, index: number, className: string, style: Record<string, string> = {}) {
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
        onclick={(e: MouseEvent) => this.run(item, e)}
      >
        <span className="Quickdraw-itemIcon">
          <Icon name={item.icon} />
        </span>
        <span className="Quickdraw-itemLabel">{item.label}</span>
        {item.badge ? <span className="Quickdraw-badge">{item.badge}</span> : null}
      </button>
    );
  }

  items(discussion: Discussion, stream: PostStreamState) {
    const items = new ItemList<Item>();
    const context = {} as any; // Not the DiscussionPage, so extensions hand over their plain button forms.

    this.replyItems(items, discussion, stream, context);
    this.linkItems(items, discussion, stream);
    this.moderationItems(items, discussion, stream, context);

    return items;
  }

  // Reply, Follow and whatever else extensions add for members, and where the reader left off.
  replyItems(items: ItemList<Item>, discussion: Discussion, stream: PostStreamState, context: any) {
    const user = app.session.user;

    if (!user || discussion.canReply()) {
      items.add(
        'reply',
        {
          icon: 'fas fa-reply',
          label: extractText(
            app.translator.trans(user ? 'core.forum.discussion_controls.reply_button' : 'core.forum.discussion_controls.log_in_to_reply_button')
          ),
          // For a guest, core opens the log-in modal and rejects the promise
          // with nothing to report; any real failure already shows core's alert.
          action: () => DiscussionControls.replyAction.call(discussion, true, false).catch(() => undefined),
          primary: true,
        },
        100
      );
    }

    DiscussionControls.userControls(discussion, context)
      .toArray()
      .forEach((vnode: any, i: number) => {
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
  }

  // Copy or share the link, and jump to either end.
  linkItems(items: ItemList<Item>, discussion: Discussion, stream: PostStreamState) {
    const url = window.location.origin + app.route.discussion(discussion);
    items.add('copy', { icon: 'fas fa-link', label: extractText(t('copy_link')), action: () => copy(url) }, 85);

    if (navigator.share) {
      items.add(
        'share',
        {
          icon: 'fas fa-share-nodes',
          label: extractText(t('share')),
          // Closing the share sheet is an AbortError and needs nothing; if the
          // browser refuses to share at all, copy the link instead.
          action: () => navigator.share({ title: discussion.title(), url }).catch((e) => e?.name === 'AbortError' || copy(url)),
        },
        80
      );
    }

    items.add('first', { icon: 'fas fa-angles-up', label: extractText(t('first_post')), action: () => stream.goToFirst() }, 75);
    items.add('last', { icon: 'fas fa-angles-down', label: extractText(t('last_post')), action: () => stream.goToLast() }, 70);
  }

  // Moderators and admins: flagged posts, then core's and extensions' moderation and destructive controls.
  moderationItems(items: ItemList<Item>, discussion: Discussion, stream: PostStreamState, context: any) {
    // Flags come with the posts already on the page, so counting them costs nothing.
    if ('flarum-flags' in (flarum.extensions || {}) && app.forum.attribute('canViewFlags')) {
      const posts = app.store
        .all<Post>('posts')
        // flags() comes from flarum/flags, which has no typings here.
        .filter((post: any) => post.discussion() === discussion && post.flags && (post.flags() || []).length)
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

    const sections: [string, Tone, number][] = [
      ['moderation', 'moderate', 40],
      ['destructive', 'danger', 20],
    ];
    sections.forEach(([section, tone, priority]) => {
      (DiscussionControls as any)
        [section + 'Controls'](discussion, context)
        .toArray()
        .forEach((vnode: any, i: number) => {
          const item = fromButton(vnode, tone);
          if (item && !items.has(vnode.itemName)) items.add(vnode.itemName, item, priority - i);
        });
    });
  }

  show(focus: string | null, keyboard = true) {
    this.open = true;
    if (!keyboard) return;
    setTimeout(() => {
      const target = (focus && this.element?.querySelector<HTMLElement>(focus)) || this.element?.querySelector<HTMLElement>('.Quickdraw-item');
      target?.focus({ preventScroll: true });
      if (focus) target?.scrollIntoView({ block: 'nearest' });
    }, 60);
  }

  close(refocus = false) {
    this.open = false;
    this.expanded = false;
    if (refocus) this.element?.querySelector<HTMLElement>('.Quickdraw-fab')?.focus({ preventScroll: true });
  }

  run(item: Item, e: MouseEvent) {
    this.close();
    item.action(e);
  }

  // Lift the button above whatever else is fixed to the bottom of the screen
  // in its column. Written straight to the element: no redraw.
  lift() {
    const el = this.element as HTMLElement | undefined;
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
    // acpl/mobile-tab's bar slides away while scrolling down: go by its class, not where it is mid-slide.
    const tab = document.querySelector<HTMLElement>('.MobileTab:not(.MobileTab--hidden)');
    if (tab) lift = Math.max(lift, tab.offsetHeight);

    const value = lift + 'px';
    if (el.style.getPropertyValue('--qd-lift') !== value) el.style.setProperty('--qd-lift', value);
  }
}
