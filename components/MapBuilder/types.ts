
import type { D3Node, MapNode, MapLink, RelationshipType, ProjectActivityType, LogicalConstruct, FormalizationResult, Citation } from '../../types';
import { RelationshipTypeInfo } from './ContextMenus/RelationshipMenu';

export interface MapBuilderProps {
    layout: { nodes: MapNode[], links: MapLink[], logicalConstructs: LogicalConstruct[] };
    setLayout: React.Dispatch<React.SetStateAction<{ nodes: MapNode[], links: MapLink[], logicalConstructs: LogicalConstruct[] }>>;
    logActivity: (type: ProjectActivityType, payload: { [key: string]: any }) => void;
    relationshipTypes: RelationshipTypeInfo[];
    onExportMapData: () => Promise<{ success: boolean; message: string }>;
    allNodes: D3Node[];
}

export interface NodeContextMenuState {
    x: number;
    y: number;
    nodeId: number | string;
}

export interface LinkContextMenuState {
    x: number;
    y: number;
    link: MapLink;
}

export interface EditLinkTypesMenuState {
    anchorEl: HTMLElement;
    link: MapLink;
}

export interface FloatingTooltipState {
    x: number;
    y: number;
    title?: string;
    text: string | string[] | RelationshipTypeInfo[] | { name: string, summary: string }[] | LogicalConstruct | Citation[];
    type?: RelationshipType | 'justification' | 'synthesis' | 'genealogy' | 'formalism' | 'logical_construct' | 'citation' | 'implications';
    color?: string;
    linkForCitation?: MapLink;
}

export interface ChangeNodeState {
    x: number;
    y: number;
    nodeId: number | string;
}

export interface SelectionBox {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

export interface DialecticAnalysisState {
    x: number;
    y: number;
    link: MapLink;
}

export interface KeyVoice {
    name: string;
    relevance: string;
}

export interface Counterargument {
    title: string;
    description: string;
}

export interface AnalysisResult {
    counterarguments: Counterargument[];
    keyVoices: {
        proponents: KeyVoice[];
        opponents: KeyVoice[];
    };
}

export type LogicalWorkbenchState = {
    x: number;
    y: number;
} & ({ link: MapLink; combinedArgument?: never } | { link?: never; combinedArgument: { premises: MapNode[], conclusion: MapNode } });

export interface ColorPickerState {
    x: number;
    y: number;
    nodeId: number | string;
}

export type MapUIState = ReturnType<typeof import('./hooks/useMapUI').useMapUI>;
export type MapAIState = ReturnType<typeof import('./hooks/useMapAI').useMapAI>;
