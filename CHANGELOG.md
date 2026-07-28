# Cookies Tab in DevTools Changelog

### Unreleased

- Safer cookie updates: in-place overwrite when identity is unchanged; restore on failed rename/domain/path `set`. Serialize background work per tab.
- Fix cookie delete to target by cookie URL + `storeId` (not tab URL + name only), matching remove-all.
- Add `@testing-library/preact` + jsdom and cover `useSelection` (click, range, keyboard, prune).
- Survive extension reload without console spam: reload the DevTools panel when possible; otherwise keep the last UI frozen (Style Detective–style quiet failure).

### Release 3.3.1

- Added Indonesian translation

### Release 3.3.0

- Added Chinese (Simplified), Korean, Japenese and Russian translations
- Fixed European Portuguese translation not appearing in the Chrome Web Store listing by renaming the `_locales/pt` folder to `_locales/pt_PT`, the locale code Chrome recognizes.
- Added unit tests

### Release 3.2.0

- Localize the extension via `chrome.i18n`. All panel UI strings and the manifest `name` / `short_name` / `description` now resolve through `_locales/<lang>/messages.json`, so the Chrome Web Store listing localizes alongside the UI and adding a new language is a drop-in JSON file with no code changes.
- Added Spanish (`es`), French (`fr`), German (`de`), Brazilian Portuguese (`pt_BR`), Dutch (`nl`), Italian (`it`), Polish (`pl`), Turkish (`tr`), Czech (`cs`), Romanian (`ro`), and European Portuguese (`pt`) translations.
- Localize the Expires column via `Intl.DateTimeFormat` so month names render in the active UI language. Drop the `(GMT)` annotation and render in the user's local timezone.
- Detect and surface the browser's RFC 6265bis 400-day cookie lifetime cap. When the user picks an expiration further out, clamp the request to 400 days and notify them of the date that will actually be stored.
- Fix the Size column to report actual UTF-8 byte length instead of character count. Cookies with non-ASCII content (e.g. UTF-8 values like `café`) were previously under-counted.
- Fixed column dividers drifting out of alignment with header dividers
- Fixed cookies failing to repopulate after Back/Forward navigation

### Release 3.1.0

- Add a settings popover (gear icon in the bottom right of footer) with toggles for the copy-to-clipboard icons and a name filter bar. Settings persist via `chrome.storage.sync`.
- Set export filename based on domain name and date
- Added ability to select multiple rows for deletion, export ([#9](https://github.com/westoque/cookie_inspector/issues/9))
- Fixed bug where form didn't update to newly selected row when open
- Various style improvements

### Release 3.0.0

- Make cookie import atomic: replace the panel's `removeAll` + per-cookie `create` burst with a single `cookies:import` command in the background. Fixes a race where imports could leave an empty cookie store. Cap imports at 1000 cookies and 8 KiB per value, and surface JSON/schema errors in the UI.
- Confirm destructive cookie import before overwriting existing cookies.
- Validate IPC and imported cookies with a shared valibot schema, replacing unsafe casts at the panel/background boundary.
- Drop `eval`-based domain lookup in **Add New**; read the domain from the active tab instead.
- Filter port connections in the background script and add Rollup overrides for the build.
- Pause cookie refresh while the DevTools panel is hidden, via `chrome.devtools.panels` `onShown`/`onHidden` and `panel:pause` / `panel:resume` messages. On resume the background sends a fresh `cookies:read`.
- Attach `webNavigation` listeners only while a panel port is connected, so the service worker isn't kept warm doing cookie work no panel consumes.
- Derive stable cookie row IDs from the chrome identity tuple (`storeId|domain|path|name`) so unchanged rows keep referential identity across refreshes and Preact can skip remounting them.
- Hoist filler cells and memoize the `<colgroup>` in `Content` to cut re-render cost.
- Fix column resize sending an absolute delta from drag-start while the hook applied it incrementally, causing widths to compound wildly. Send per-event incremental delta.
- Reposition the context menu to stay within the viewport; dismiss it on mousedown outside.
- Focus the value field when the edit form opens; rename the submit button to "Save".
- Improve input colors and edit-form styling in dark mode.

### Release 2.2.0

- Rewrite the DevTools panel UI in Preact + JSX, replacing Backbone, jQuery, Underscore, Mustache, and Hogan. Delete `lib/`.
- Convert panel CSS to SCSS with CSS variable theming.
- Add a **Refresh** entry to the cookie context menu ([#12](https://github.com/westoque/cookie_inspector/issues/12)) for cases where `chrome.cookies.onChanged` doesn't fire.
- Add hover-to-copy affordance on cookie name and value cells ([#5](https://github.com/westoque/cookie_inspector/issues/5)).
- Drop redundant `http://*/*` and `https://*/*` host permissions (covered by `*://*/*`).
- Drop unused `unlimitedStorage` permission.
- Bump `minimum_chrome_version` to 116.
- README: add architecture overview and document the host-permission decision.

### Release 2.1.0

- Add a Vite + `@crxjs/vite-plugin` build pipeline; introduce TypeScript (strict), ESLint flat config, Prettier, and Vitest. Move sources under `src/`.
- Convert `background.js`, `devtools-page.js`, `socket.js`, and `ci.js` to TypeScript with `const`/`let` and promise-form `chrome.*` APIs.
- Harden the MV3 service worker: extract a typed `CookieService`, treat the devtools port as rebuildable across SW idle, and stop relying on the in-memory `listeners` map surviving suspension.
- Fix `cookies:update` to preserve the full attribute set (`sameSite`, `storeId`, partition keys) instead of dropping them on `remove` + `set`.

### Release 2.0.8

- Add Dark Theme (thanks to @clarketm)

### Release 2.0.7

- Bump version to sync with Chrome Web Store version.

### Release 2.0.5

- [#10](https://github.com/westoque/cookie_inspector/pull/10) Narrow down manifest permissions
- [#6](https://github.com/westoque/cookie_inspector/pull/6) Double click cookie row to bring up editing pane
