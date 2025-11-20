import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const isDev = process.env.NODE_ENV === 'development';
const isVercel = process.env.VERCEL === '1';

// Dynamic URL based on environment
const siteUrl = isDev 
  ? 'http://localhost:3000'
  : isVercel 
    ? 'https://bitredict.vercel.app'
    : 'https://bitredict.io';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Bitredict Documentation',
  tagline: 'Decentralized Prediction Markets on Somnia',
  favicon: 'img/favicon.svg',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: siteUrl,
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/docs/',
  trailingSlash: false,

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'bitredict', // Usually your GitHub org/user name.
  projectName: 'bitredict', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to set it to `zh-Hans`.
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
          routeBasePath: '/', // Serve docs at the site's root
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/bitredict/bitredict/tree/main/docs/',
        },
        blog: false, // Disable blog for now
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: ['@docusaurus/theme-mermaid'],
  
  markdown: {
    mermaid: true,
  },

  themeConfig: {
    metadata: [
      {name: 'keywords', content: 'bitredict, prediction markets, blockchain, somnia network, documentation'},
      {name: 'twitter:card', content: 'summary_large_image'},
      {name: 'twitter:site', content: '@bitredict'},
      {name: 'og:type', content: 'website'},
      {name: 'og:title', content: 'Bitredict Documentation'},
      {name: 'og:description', content: 'Documentation for Bitredict - Decentralized Prediction Markets on Somnia Network'},
    ],
    // Replace with your project's social card
    image: 'img/bitredict-social-card.svg',
    navbar: {
      title: '', // Remove title to show only logo
      logo: {
        alt: 'Bitredict Logo',
        src: 'img/logo.png',
        srcDark: 'img/logo.png',
        width: 24,
        height: 24,
        style: {
          maxWidth: 'none',
          maxHeight: 'none',
        },
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/raskal33',
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://bitredict.io',
          label: 'Launch App',
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
              label: 'Introduction',
              to: '/',
            },
            {
              label: 'Prediction Markets',
              to: '/prediction-markets',
            },
            {
              label: 'Examples',
              to: '/examples',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Telegram',
              href: 'https://t.me/bitredict',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/bitredict',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/raskal33',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Launch App',
              href: 'https://bitredict.io',
            },
            {
              label: 'Somnia Network',
              href: 'https://somnia.network',
            },
          ],
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['solidity', 'javascript', 'typescript', 'json'],
    },
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
