/**
 * @type {import('semantic-release').GlobalConfig}
 */
module.exports = {
  branches: [
    'main'
  ],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/npm',
      {
        npmPublish: false
      }
    ],
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'npm run build && npx electron-builder --win --publish never && npm run checksums'
      }
    ],
    [
      '@semantic-release/github',
      {
        assets: [
          { path: 'dist/*.exe' },
          { path: 'dist/latest.yml' },
          { path: 'dist/*.blockmap' },
          { path: 'dist/SHA256SUMS.txt' }
        ]
      }
    ]
  ]
}
