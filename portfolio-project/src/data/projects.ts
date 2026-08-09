export type Project = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  url: string;
  year: number;
};

export const allTags = ['React', 'TypeScript', 'Node', 'CSS', 'Testing'];

export const projects: Project[] = [
  {
    id: 'pixel-portfolio',
    title: 'Pixel Portfolio',
    description: 'A static site generator that turns a folder of markdown into a portfolio.',
    tags: ['React', 'TypeScript', 'CSS'],
    url: 'https://example.com/pixel-portfolio',
    year: 2025
  },
  {
    id: 'task-flow',
    title: 'Task Flow',
    description: 'A keyboard first task board with offline sync and undo history.',
    tags: ['React', 'TypeScript'],
    url: 'https://example.com/task-flow',
    year: 2025
  },
  {
    id: 'weather-now',
    title: 'Weather Now',
    description: 'A three day forecast widget that renders in under fifty milliseconds.',
    tags: ['React', 'CSS'],
    url: 'https://example.com/weather-now',
    year: 2024
  },
  {
    id: 'snippet-vault',
    title: 'Snippet Vault',
    description: 'A command line vault for code snippets with fuzzy search.',
    tags: ['Node', 'TypeScript'],
    url: 'https://example.com/snippet-vault',
    year: 2024
  },
  {
    id: 'commit-coach',
    title: 'Commit Coach',
    description: 'A git hook that reviews your commit message before it lands.',
    tags: ['Node', 'Testing'],
    url: 'https://example.com/commit-coach',
    year: 2023
  },
  {
    id: 'design-tokens-kit',
    title: 'Design Tokens Kit',
    description: 'A token pipeline that keeps Figma and CSS variables in sync.',
    tags: ['CSS', 'Testing'],
    url: 'https://example.com/design-tokens-kit',
    year: 2023
  }
];
