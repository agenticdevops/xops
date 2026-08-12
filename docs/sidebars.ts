import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    'getting-started',
    {
      type: 'category',
      label: 'Tutorials',
      items: [
        'tutorials/fix-docker-container',
        'tutorials/safe-k8s-triage',
      ],
    },
    {
      type: 'category',
      label: 'Channels',
      items: [
        'channels/telegram',
        'channels/slack',
        'channels/web',
      ],
    },
    'configuration',
    'cli',
    {
      type: 'category',
      label: 'Features',
      items: [
        'features/memory',
        'features/skills',
        'features/automation',
      ],
    },
    {
      type: 'category',
      label: 'Advanced',
      items: [
        'advanced/architecture',
        'advanced/self-hosting',
        'advanced/security',
      ],
    },
  ],
};

export default sidebars;
