# Jira dashboard gadget

This Forge app keeps a single Custom UI source tree under `static/hello-world/src`.

## Source layout

- `src/index.js` contains the Forge resolver that fetches Jira data and prepares burndown responses.
- `src/config.js` contains server-side defaults shared by the resolver.
- `static/hello-world/src` contains the React Custom UI rendered by the dashboard gadget.
- `static/hello-world/build` is the compiled Custom UI resource referenced by `manifest.yml`.

Run the root build script to compile the Custom UI from the canonical static source tree:

```sh
npm run build
```
