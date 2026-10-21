# Zack UI installer

Installs Zack UI Pro or Zack Post Cards directly into a local agent skills folder. No ZIP is created.

```bash
npx --yes github:yckonnnnn/zack-cli install zack-ui-pro --license <code>
npx --yes github:yckonnnnn/zack-cli install zack-post-cards --license <code>
```

The installer reads the personal link issued after purchase, downloads the latest file manifest from `zackui.com`, and writes the files directly into:

- `~/.agents/skills/<skill>`
- or `$CODEX_HOME/skills/<skill>` when `CODEX_HOME` is set

Use `--to <skills-root>` to install into a different skills directory.

Run the same command again to update. The license link is the access key; anyone with the link can install.
