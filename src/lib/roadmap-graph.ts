import type { Edge, Node } from '@xyflow/react';

export type NodeData = {
  label: string;
  subLabel?: string;
  type: 'course' | 'project' | 'dsa' | 'milestone' | 'apply';
  color: 'yellow' | 'blue' | 'green' | 'lime' | 'purple';
  tag?: 'available' | 'future' | 'Learn Anytime' | 'Start logically here after foundation' | 'Go here first' | 'Pick one as per interest' | 'complete crash course then nextjs';
  link?: string;
  phaseId: string;
  weekId: string;
  taskId: string;
};

// Colors mapping:
// yellow -> Foundations / Core JS
// blue -> Sub-tasks / Challenges
// green -> Frontend / Phase 2/3 generic
// lime -> specific projects / "Learn Anytime"
// purple -> Backend / DBs

export const initialNodes: Node<NodeData>[] = [
  // --- Phase 1: Core Path ---
  {
    id: 'web-dev',
    position: { x: 0, y: 0 },
    data: { label: 'Web development', type: 'course', color: 'yellow', phaseId: 'phase-1', weekId: 'core', taskId: 'web-dev' }
  },
  {
    id: 'foundation',
    position: { x: 0, y: 0 },
    data: { label: 'Foundation of web', type: 'course', color: 'yellow', phaseId: 'phase-1', weekId: 'core', taskId: 'foundation' }
  },
  {
    id: 'html',
    position: { x: 0, y: 0 },
    data: { label: 'Learn HTML', type: 'course', color: 'yellow', phaseId: 'phase-1', weekId: 'core', taskId: 'html' }
  },
  {
    id: 'html-chal',
    position: { x: 0, y: 0 },
    data: { label: 'Section 3 - Learn HTML, Section 4 - HTML Coding Challenges', type: 'course', color: 'blue', phaseId: 'phase-1', weekId: 'core', taskId: 'html-chal' }
  },
  {
    id: 'css',
    position: { x: 0, y: 0 },
    data: { label: 'Learn CSS', type: 'course', color: 'yellow', phaseId: 'phase-1', weekId: 'core', taskId: 'css' }
  },
  {
    id: 'css-sec',
    position: { x: 0, y: 0 },
    data: { label: 'Section 5 - CSS, selectors, Flex, Grid, Bootstrap, break points etc', type: 'course', color: 'blue', phaseId: 'phase-1', weekId: 'core', taskId: 'css-sec' }
  },
  {
    id: 'css-chal',
    position: { x: 0, y: 0 },
    data: { label: 'CSS Challenges', type: 'course', color: 'blue', phaseId: 'phase-1', weekId: 'core', taskId: 'css-chal' }
  },
  {
    id: 'tailwind',
    position: { x: 0, y: 0 },
    data: { label: 'Tailwind', type: 'course', color: 'yellow', phaseId: 'phase-1', weekId: 'core', taskId: 'tailwind' }
  },
  {
    id: 'tailwind-learn',
    position: { x: 0, y: 0 },
    data: { label: 'Learn Tailwind', type: 'course', color: 'blue', phaseId: 'phase-1', weekId: 'core', taskId: 'tailwind-learn' }
  },
  {
    id: 'tailwind-chal',
    position: { x: 0, y: 0 },
    data: { label: 'Tailwind challenges', type: 'course', color: 'blue', phaseId: 'phase-1', weekId: 'core', taskId: 'tailwind-chal' }
  },
  {
    id: 'js-hub',
    position: { x: 0, y: 0 },
    data: { label: 'Javascript', type: 'course', color: 'yellow', tag: 'Start logically here after foundation', phaseId: 'phase-1', weekId: 'core', taskId: 'js-hub' }
  },

  // --- JS Detour (Right) ---
  {
    id: 'js-found',
    position: { x: 0, y: 0 },
    data: { label: 'JS foundation', type: 'course', color: 'yellow', tag: 'Go here first', phaseId: 'phase-1', weekId: 'js-core', taskId: 'js-found' }
  },
  {
    id: 'js-oop',
    position: { x: 0, y: 0 },
    data: { label: 'JS OOP', type: 'course', color: 'yellow', phaseId: 'phase-1', weekId: 'js-core', taskId: 'js-oop' }
  },
  {
    id: 'dom-bom',
    position: { x: 0, y: 0 },
    data: { label: 'DOM BOM', type: 'course', color: 'yellow', phaseId: 'phase-1', weekId: 'js-core', taskId: 'dom-bom' }
  },
  {
    id: 'adv-js',
    position: { x: 0, y: 0 },
    data: { label: 'Advance JS', type: 'course', color: 'yellow', phaseId: 'phase-1', weekId: 'js-core', taskId: 'adv-js' }
  },
  {
    id: 'js-proj',
    position: { x: 0, y: 0 },
    data: { label: 'JS Projects', type: 'project', color: 'yellow', phaseId: 'phase-1', weekId: 'js-core', taskId: 'js-proj' }
  },

  // --- Frontend Detour (Left) ---
  {
    id: 'fe-dev',
    position: { x: 0, y: 0 },
    data: { label: 'Front end Development', type: 'course', color: 'green', tag: 'Pick one as per interest', phaseId: 'phase-1', weekId: 'frontend', taskId: 'fe-dev' }
  },
  {
    id: 'react-proj',
    position: { x: 0, y: 0 },
    data: { label: 'React + Projects', type: 'project', color: 'green', phaseId: 'phase-1', weekId: 'frontend', taskId: 'react-proj' }
  },

  // --- Backend Detour (Down) ---
  {
    id: 'be-dev',
    position: { x: 0, y: 0 },
    data: { label: 'Backend Development', type: 'course', color: 'purple', phaseId: 'phase-1', weekId: 'backend', taskId: 'be-dev' }
  },
  {
    id: 'node-proj',
    position: { x: 0, y: 0 },
    data: { label: 'NodeJS + Projects', type: 'project', color: 'purple', phaseId: 'phase-1', weekId: 'backend', taskId: 'node-proj' }
  },
  {
    id: 'db-intro',
    position: { x: 0, y: 0 },
    data: { label: 'DB Intros', type: 'course', color: 'purple', phaseId: 'phase-1', weekId: 'backend', taskId: 'db-intro' }
  },

  // --- DB branches ---
  {
    id: 'mongo-agg',
    position: { x: 0, y: 0 },
    data: { label: 'Mongo Aggregation Pipelines', type: 'course', color: 'purple', tag: 'available', phaseId: 'phase-1', weekId: 'backend', taskId: 'mongo-agg' }
  },
  {
    id: 'redis',
    position: { x: 0, y: 0 },
    data: { label: 'Redis', type: 'course', color: 'purple', tag: 'future', phaseId: 'phase-1', weekId: 'backend', taskId: 'redis' }
  },
  {
    id: 'mega-proj',
    position: { x: 0, y: 0 },
    data: { label: 'Mega project with node + express + mongo', type: 'project', color: 'purple', phaseId: 'phase-1', weekId: 'backend', taskId: 'mega-proj' }
  },
  {
    id: 'deploy',
    position: { x: 0, y: 0 },
    data: { label: 'Deploy', type: 'project', color: 'lime', tag: 'Learn Anytime', phaseId: 'phase-1', weekId: 'backend', taskId: 'deploy' }
  },
  {
    id: 'sql',
    position: { x: 0, y: 0 },
    data: { label: 'SQL + Postgresql', type: 'course', color: 'purple', phaseId: 'phase-1', weekId: 'backend', taskId: 'sql' }
  },
  {
    id: 'prisma',
    position: { x: 0, y: 0 },
    data: { label: 'Prisma', type: 'course', color: 'purple', tag: 'complete crash course then nextjs', phaseId: 'phase-1', weekId: 'backend', taskId: 'prisma' }
  },
  {
    id: 'auth-next',
    position: { x: 0, y: 0 },
    data: { label: 'full stack Auth NextJS', type: 'project', color: 'lime', tag: 'Learn Anytime', phaseId: 'phase-1', weekId: 'backend', taskId: 'auth-next' }
  },
  {
    id: 'qna',
    position: { x: 0, y: 0 },
    data: { label: 'QnA system - full stack', type: 'project', color: 'lime', phaseId: 'phase-1', weekId: 'backend', taskId: 'qna' }
  },
  {
    id: 'saas',
    position: { x: 0, y: 0 },
    data: { label: 'Build AI powered SAAS NextJS, prisma, Neon DB', type: 'project', color: 'lime', tag: 'Learn Anytime', phaseId: 'phase-1', weekId: 'backend', taskId: 'saas' }
  },

  // --- Phase 2 ---
  {
    id: 'micro',
    position: { x: 0, y: 0 },
    data: { label: 'Micro-services Queue systems', type: 'course', color: 'green', tag: 'future', phaseId: 'phase-2', weekId: 'w1', taskId: 'micro' }
  },
  {
    id: 'sockets',
    position: { x: 0, y: 0 },
    data: { label: 'Sockets', type: 'course', color: 'green', tag: 'future', phaseId: 'phase-2', weekId: 'w1', taskId: 'sockets' }
  },
  {
    id: 'docker',
    position: { x: 0, y: 0 },
    data: { label: 'Docker', type: 'course', color: 'green', tag: 'available', phaseId: 'phase-2', weekId: 'w1', taskId: 'docker' }
  },
  {
    id: 'fsp',
    position: { x: 0, y: 0 },
    data: { label: 'Full Stack Project', type: 'project', color: 'purple', phaseId: 'phase-2', weekId: 'w2', taskId: 'fsp' }
  },
  {
    id: 'fastify',
    position: { x: 0, y: 0 },
    data: { label: 'Fastify Framework', type: 'course', color: 'purple', tag: 'available', phaseId: 'phase-2', weekId: 'w2', taskId: 'fastify' }
  },

  // --- Phase 3 ---
  {
    id: 'tf',
    position: { x: 0, y: 0 },
    data: { label: 'Tensorflow JS', type: 'course', color: 'green', tag: 'future', phaseId: 'phase-3', weekId: 'w1', taskId: 'tf' }
  },
  {
    id: 'angular',
    position: { x: 0, y: 0 },
    data: { label: 'Angular', type: 'course', color: 'green', tag: 'future', phaseId: 'phase-3', weekId: 'w1', taskId: 'angular' }
  },
  {
    id: 'langchain',
    position: { x: 0, y: 0 },
    data: { label: 'AI - langchain', type: 'course', color: 'green', tag: 'future', phaseId: 'phase-3', weekId: 'w1', taskId: 'langchain' }
  }
];

export const initialEdges: Edge[] = [
  // Core Web Dev
  { id: 'e1', source: 'web-dev', target: 'foundation', type: 'smoothstep' },
  { id: 'e2', source: 'foundation', target: 'html', type: 'smoothstep' },
  { id: 'e3', source: 'html', target: 'html-chal', type: 'smoothstep' },
  { id: 'e4', source: 'html', target: 'css', type: 'smoothstep' },
  { id: 'e5', source: 'css', target: 'css-sec', type: 'smoothstep' },
  { id: 'e6', source: 'css-sec', target: 'css-chal', type: 'smoothstep' },
  { id: 'e7', source: 'css', target: 'tailwind', type: 'smoothstep' },
  { id: 'e8', source: 'tailwind', target: 'tailwind-learn', type: 'smoothstep' },
  { id: 'e9', source: 'tailwind-learn', target: 'tailwind-chal', type: 'smoothstep' },
  { id: 'e10', source: 'tailwind', target: 'js-hub', type: 'smoothstep' },

  // Detour JS
  { id: 'e11', source: 'js-hub', target: 'js-found', type: 'smoothstep' },
  { id: 'e12', source: 'js-found', target: 'js-oop', type: 'smoothstep' },
  { id: 'e13', source: 'js-found', target: 'dom-bom', type: 'smoothstep' },
  { id: 'e14', source: 'dom-bom', target: 'adv-js', type: 'smoothstep' },
  { id: 'e15', source: 'adv-js', target: 'js-proj', type: 'smoothstep' },

  // Detour Frontend
  { id: 'e16', source: 'js-hub', target: 'fe-dev', type: 'smoothstep' },
  { id: 'e17', source: 'fe-dev', target: 'react-proj', type: 'smoothstep' },

  // Detour Backend
  { id: 'e18', source: 'js-hub', target: 'be-dev', type: 'smoothstep' },
  { id: 'e19', source: 'be-dev', target: 'node-proj', type: 'smoothstep' },
  { id: 'e20', source: 'node-proj', target: 'db-intro', type: 'smoothstep' },

  // DB Branches
  { id: 'e21', source: 'db-intro', target: 'mongo-agg', type: 'smoothstep' },
  { id: 'e22', source: 'mongo-agg', target: 'redis', type: 'smoothstep' },
  
  { id: 'e23', source: 'db-intro', target: 'mega-proj', type: 'smoothstep' },
  { id: 'e24', source: 'mega-proj', target: 'deploy', type: 'smoothstep', animated: true }, // curved left visual
  { id: 'e25', source: 'mega-proj', target: 'sql', type: 'smoothstep' },
  
  { id: 'e26', source: 'sql', target: 'prisma', type: 'smoothstep' },
  { id: 'e27', source: 'prisma', target: 'auth-next', type: 'smoothstep', animated: true }, // curved left visual
  { id: 'e28', source: 'auth-next', target: 'qna', type: 'smoothstep' },
  
  { id: 'e29', source: 'prisma', target: 'saas', type: 'smoothstep', animated: true }, // curved right visual
  
  // Note: Phase 2 and 3 nodes are standalone per the diagram, no explicit edges drawn between them.
  // They will be positioned via Dagre or manually to group them.
];
