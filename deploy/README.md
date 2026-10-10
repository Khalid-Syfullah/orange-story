# Deployment

orange-story deploys to one EC2 instance (ap-southeast-2) behind nginx at
https://production.khalidsyfullah.com. There is no SSH and no open deploy port.

## Flow

1. Push or merge to `main`.
2. `deploy.yml` runs CI (`lint`, `typecheck`, `build`). If CI fails, nothing is deployed.
3. It assumes the AWS role `orange-github-deploy` through GitHub OIDC (no stored keys).
4. It sends `deploy/orange-deploy.sh` to the instance over AWS Systems Manager and runs it as `ubuntu`.
5. The script builds the commit into `/var/www/orange/releases/<timestamp>`, flips
   `/var/www/orange/current`, reloads pm2 (`orange`, port 3000) and health-checks it.
   A failed health check restores the previous release. The last 5 releases are kept.
6. A final smoke test requests the public URL.

Pull requests run CI only (`ci.yml`).

## One-time setup (already done for the server)

- GitHub: Settings > Environments > `production`, restrict deployment branches to `main`.
- AWS: the role `orange-github-deploy` must trust this repo only:
  `repo:Khalid-Syfullah/orange-story:environment:production` (see `iam/trust-policy.json`).

## Rollback

Re-run the **Deploy** workflow on an older commit, or on the server:

    cd /var/www/orange && ls -1dt releases/*
    ln -sfn "$PWD/releases/<timestamp>" current.tmp && mv -Tf current.tmp current
    pm2 startOrReload ecosystem.config.cjs --update-env

## Note for the phase pack

Every phase pushes to `main`, so every phase that passes CI goes live. To keep
production stable while building, run the pack on a branch (`PUSH_REMOTE`/branch
settings in `config.env`) and merge when ready.
