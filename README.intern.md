
# About this Project 

## Publishing

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- PAT, Personal Access Token:
  - https://frawa.visualstudio.com/_usersSettings/tokens
  - One easy mistake to make when creating the PAT (Personal Access Token) is to not select All accessible organizations in the Organizations field drop-down (instead selecting a specific organization). You should also set the Authorized Scopes to Marketplace (Manage) for the publish to work.
  - Organizations: All accessible organizations
  - Authorized Scopes: Marketplace (Manage)

## Prepare
```
yarn global add vsce
yarn vsce login FraWa
```

## Always
```
yarn test
yarn test-mutate
yarn vsce-package
```

## Publish
```
VERSION=...
yarn vsce-publish $VERSION
git tag $VERSION
git push origin $VERSION
```