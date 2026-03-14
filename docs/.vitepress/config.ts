import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'RalphFlow',
  description: 'Multi-agent AI workflow orchestration framework for Claude Code',
  base: '/ralph-flow/',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['meta', { name: 'theme-color', content: '#5b6ee1' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/quick-start' },
      { text: 'Reference', link: '/reference/configuration' },
      {
        text: 'v0.5.0',
        items: [
          { text: 'Changelog', link: 'https://github.com/rahulthakur319/ralph-flow/releases' },
          { text: 'npm', link: 'https://www.npmjs.com/package/ralphflow' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Quick Start', link: '/guide/quick-start' },
            { text: 'Core Concepts', link: '/guide/core-concepts' },
          ],
        },
        {
          text: 'Using RalphFlow',
          items: [
            { text: 'Dashboard', link: '/guide/dashboard' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Configuration', link: '/reference/configuration' },
            { text: 'Templates', link: '/reference/templates' },
            { text: 'API', link: '/reference/api' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/rahulthakur319/ralph-flow' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
    },

    editLink: {
      pattern: 'https://github.com/rahulthakur319/ralph-flow/edit/main/docs/:path',
    },
  },
})
