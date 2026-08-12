import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'OpsPilot',
  tagline: 'Your 24/7 DevOps Copilot that actually does the work',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://agenticdevops.github.io',
  baseUrl: '/opspilot/',

  organizationName: 'agenticdevops',
  projectName: 'opspilot',

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
          editUrl: 'https://github.com/agenticops/opspilot/tree/main/docs/',
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
    image: 'img/opspilot-social.png',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'OpsPilot',
      logo: {
        alt: 'OpsPilot Logo',
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
          href: 'https://github.com/agenticops/opspilot',
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
              href: 'https://github.com/agenticops/opspilot',
            },
            {
              label: 'Discord',
              href: 'https://discord.gg/opspilot',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/opspilot',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} OpsPilot. Built with Docusaurus.`,
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
