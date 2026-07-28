import { useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from '@xyflow/react';
import type { Node, Edge, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { initialNodes, initialEdges } from '../lib/roadmap-graph';
import type { NodeData } from '../lib/roadmap-graph';
import { Check } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Phase, Task, TaskType } from '../store/data';

// --- Dagre Layout ---
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 240;
const nodeHeight = 80;

type RoadmapNodeT = Node<NodeData & { completed?: boolean; added?: boolean }>;

const getLayoutedElements = (nodes: RoadmapNodeT[], edges: Edge[], direction = 'TB') => {
  dagreGraph.setGraph({ rankdir: direction, ranksep: 60, nodesep: 40 });

  const phase1Nodes = nodes.filter(n => n.data.phaseId === 'phase-1');
  const phase1Edges = edges.filter(e => {
    const s = phase1Nodes.find(n => n.id === e.source);
    const t = phase1Nodes.find(n => n.id === e.target);
    return s && t;
  });

  phase1Nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  phase1Edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  let maxPhase1X = 0;

  const newNodes = nodes.map((node) => {
    if (node.data.phaseId === 'phase-1') {
      const nodeWithPosition = dagreGraph.node(node.id);
      if (nodeWithPosition.x > maxPhase1X) maxPhase1X = nodeWithPosition.x;
      return {
        ...node,
        targetPosition: Position.Top,
        sourcePosition: Position.Bottom,
        position: {
          x: nodeWithPosition.x - nodeWidth / 2,
          y: nodeWithPosition.y - nodeHeight / 2,
        },
      };
    }
    return node;
  });

  // Manual positioning for Phase 2 and 3
  const startX = maxPhase1X + 400;
  const col2X = startX + 300;

  const phase2Y = 0;
  const phase3Y = 400;

  newNodes.forEach(n => {
    if (n.data.phaseId === 'phase-2') {
      if (n.id === 'micro') n.position = { x: startX, y: phase2Y };
      if (n.id === 'sockets') n.position = { x: startX, y: phase2Y + 120 };
      if (n.id === 'docker') n.position = { x: startX, y: phase2Y + 240 };
      if (n.id === 'fsp') n.position = { x: col2X, y: phase2Y };
      if (n.id === 'fastify') n.position = { x: col2X, y: phase2Y + 120 };
    }
    if (n.data.phaseId === 'phase-3') {
      if (n.id === 'tf') n.position = { x: startX, y: phase3Y };
      if (n.id === 'angular') n.position = { x: startX, y: phase3Y + 120 };
      if (n.id === 'langchain') n.position = { x: col2X, y: phase3Y };
    }
  });

  return { nodes: newNodes, edges };
};

// --- Custom Node ---
function RoadmapNode({ data }: NodeProps<RoadmapNodeT>) {
  // Two-color system: every node is the same neutral card; the cozy left-edge
  // marks a project (vs a course), and completed nodes fill ink.
  const isProject = data.type?.toLowerCase() === 'project';
  return (
    <div
      className={cn(
        'relative px-4 py-3 rounded-xl border min-w-[240px] max-w-[260px] cursor-pointer transition-all',
        data.completed ? 'opacity-70' : 'hover:-translate-y-0.5',
      )}
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        borderLeft: `3px solid ${isProject ? 'var(--cozy)' : 'var(--border-strong)'}`,
        boxShadow: 'var(--shadow-sm)',
        color: 'var(--text)',
      }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />

      {data.tag && (
        <div className="absolute -top-2.5 left-2 text-[11px] px-2 py-0.5 rounded-full font-semibold z-10 whitespace-nowrap"
          style={{ background: 'var(--cozy)', color: '#fff' }}>
          {data.tag}
        </div>
      )}

      {data.completed && (
        <div className="absolute -right-2 -top-2 p-1 rounded-full z-10" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
          <Check className="w-3 h-3" />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <h3 className={cn('font-semibold text-sm leading-tight', data.completed && 'line-through')} style={{ color: 'var(--text)' }}>
          {data.label}
        </h3>
        {data.subLabel && <p className="text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>{data.subLabel}</p>}

        <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: isProject ? 'var(--cozy)' : 'var(--text-subtle)' }}>
            {data.type}
          </span>
          {data.added && (
            <span className="text-[11px] font-medium px-1.5 rounded" style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}>In Tasks</span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

const nodeTypes = {
  roadmap: RoadmapNode,
};

// --- Main Component ---
export default function RoadmapGraph({
  phases,
  onNodeClick,
  addedKeys,
}: {
  phases: Phase[];
  onNodeClick: (node: { phaseId: string; weekId: string; task: Task; phaseTitle: string; weekTitle: string }) => void;
  addedKeys: Set<string>;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    const hydratedNodes: RoadmapNodeT[] = initialNodes.map((n) => {
      // Find completed status from `phases` to reflect actual user progress
      const p = phases.find((x) => x.id === n.data.phaseId);
      const w = p?.weeks.find((x) => x.id === n.data.weekId);
      const t = w?.tasks.find((x) => x.id === n.data.taskId);
      
      return {
        ...n,
        type: 'roadmap',
        data: {
          ...n.data,
          completed: t?.completed || false,
          added: addedKeys.has(`${n.data.phaseId}:${n.data.weekId}:${n.data.taskId}`)
        }
      };
    });

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      hydratedNodes,
      initialEdges
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [phases, addedKeys, setNodes, setEdges]);

  return (
    <div className="w-full h-[600px] border border-border rounded-xl overflow-hidden bg-surface shadow-inner">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        onNodeClick={(_, node) => {
          // Construct task directly from node data to guarantee interaction works even if phase sync is delayed
          const taskObj: Task = {
            id: node.data.taskId as string,
            title: node.data.label as string,
            type: node.data.type as TaskType,
            completed: !!node.data.completed
          };
          onNodeClick({
            phaseId: node.data.phaseId as string,
            weekId: node.data.weekId as string,
            task: taskObj,
            phaseTitle: node.data.phaseId as string,
            weekTitle: node.data.weekId as string,
          });
        }}
        minZoom={0.1}
      >
        <Background gap={16} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
