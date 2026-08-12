import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'xops',
  tagline: 'The agentic [x]ops tool — DevOps, SRE, and beyond, driven from chat',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://agenticdevops.github.io',
  baseUrl: '/opspilot/', // tracks GH repo name; -> '/xops/' when repo renamed or custom domain (docs.xops.bot) wired

  organizationName: 'agenticdevops',
  projectName: 'opspilot', // GH repo name (product is 'xops')

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/agenticops/xops/tree/main/docs/',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/xops-social.png',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'xops',
      logo: {
        alt: 'xops Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/cli',
          label: 'CLI Reference',
          position: 'left',
        },
        {
          href: 'https://github.com/agenticops/xops',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/getting-started',
            },
            {
              label: 'Configuration',
              to: '/configuration',
            },
            {
              label: 'CLI Reference',
              to: '/cli',
            },
          ],
        },
        {
          title: 'Channels',
          items: [
            {
              label: 'Telegram',
              to: '/channels/telegram',
            },
            {
              label: 'Slack',
              to: '/channels/slack',
            },
            {
              label: 'Web Chat',
              to: '/channels/web',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/agenticops/xops',
            },
            {
              label: 'Discord',
              href: 'https://discord.gg/xops',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/xops',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} xops. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'yaml', 'json'],
    },
    algolia: undefined,
  } satisfies Preset.ThemeConfig,
};

export default config;
