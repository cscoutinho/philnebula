





import React from 'react';
import { ProjectActivity, ProjectActivityType } from '../types';
import { ChevronLeft, BrainCircuit, Network, PlusCircle, LinkIcon, RssIcon, SparkleIcon, DiaryIcon, ExternalLinkIcon, ReplaceIcon, HistoryIcon, MessageSquareQuote, ScaleIcon, FlaskConicalIcon, Edit } from './icons';

interface ProjectDiaryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    entries: ProjectActivity[];
}

const timeAgo = (timestamp: number): string => {
    const now = Date.now();
    const seconds = Math.floor((now - timestamp) / 1000);
    if (seconds < 2) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

const ActivityIcon: React.FC<{ type: ProjectActivity['type'] }> = ({ type }) => {
    switch (type) {
        case 'EXPLORE_CONCEPT': return <Network className="w-4 h-4 text-cyan-400" />;
        case 'FIND_RELATED': return <SparkleIcon className="w-4 h-4 text-purple-400" />;
        case 'ADD_TO_TRAY': return <PlusCircle className="w-4 h-4 text-yellow-400" />;
        case 'CREATE_MAP_LINK': return <LinkIcon className="w-4 h-4 text-blue-400" />;
        case 'CREATE_USER_NODE': return <Edit className="w-4 h-4 text-white" />;
        case 'ADD_FEED': return <RssIcon className="w-4 h-4 text-green-400" />;
        case 'VIEW_PUBLICATION': return <ExternalLinkIcon className="w-4 h-4 text-sky-400" />;
        case 'ANALYZE_GENEALOGY': return <HistoryIcon className="w-4 h-4 text-amber-400" />;
        case 'EXPLORE_IMPLICATIONS': return <MessageSquareQuote className="w-4 h-4 text-indigo-400" />;
        case 'CHANGE_CONCEPT': return <ReplaceIcon className="w-4 h-4 text-orange-400" />;
        case 'SYNTHESIZE_REGION': return <SparkleIcon className="w-4 h-4 text-purple-400" />;
        case 'ANALYZE_ARGUMENT': return <ScaleIcon className="w-4 h-4 text-lime-400" />;
        case 'FORMALIZE_ARGUMENT': return <FlaskConicalIcon className="w-4 h-4 text-teal-400" />;
        case 'CREATE_LOGICAL_CONSTRUCT': return <FlaskConicalIcon className="w-4 h-4 text-teal-500" />;
        case 'GENERATE_JUSTIFICATION': return <SparkleIcon className="w-4 h-4 text-indigo-400" />;
        default: return <BrainCircuit className="w-4 h-4 text-gray-400" />;
    }
};

const ActivityText: React.FC<{ activity: ProjectActivity }> = ({ activity }) => {
    const { type, payload } = activity;
    switch (type) {
        case 'EXPLORE_CONCEPT':
            return <>Explored <span className="font-bold text-gray-100">'{payload.conceptName}'</span> in the Nebula.</>;
        case 'FIND_RELATED':
            return <>Searched for concepts related to <span className="font-bold text-gray-100">'{payload.conceptName}'</span>.</>;
        case 'ADD_TO_TRAY':
            return <>Added <span className="font-bold text-gray-100">'{payload.conceptName}'</span> to the Map Tray.</>;
        case 'CREATE_MAP_LINK':
            return <>Linked <span className="font-bold text-gray-100">'{payload.sourceName}'</span> to <span className="font-bold text-gray-100">'{payload.targetName}'</span>.</>;
        case 'CREATE_USER_NODE':
            return <>Created a new concept: <span className="font-bold text-gray-100">'{payload.conceptName}'</span>.</>;
        case 'ADD_FEED':
            return <>Started tracking a new feed for <span className="font-bold text-gray-100">'{payload.conceptName}'</span>.</>;
        case 'VIEW_PUBLICATION':
            return <>Viewed publication <a href={payload.publicationLink} target="_blank" rel="noopener noreferrer" className="font-bold text-cyan-300 hover:underline">'{payload.publicationTitle}'</a> from the '{payload.sourceNodeName}' feed.</>;
        case 'ANALYZE_GENEALOGY':
            return <>Analyzed genealogy of <span className="font-bold text-gray-100">'{payload.conceptName}'</span>.</>;
        case 'EXPLORE_IMPLICATIONS':
            return <>Explored implications between <span className="font-bold text-gray-100">'{payload.sourceName}'</span> and <span className="font-bold text-gray-100">'{payload.targetName}'</span>.</>;
        case 'CHANGE_CONCEPT':
            return <>Replaced <span className="font-bold text-gray-100">'{payload.oldConceptName}'</span> with <span className="font-bold text-gray-100">'{payload.newConceptName}'</span> on the map.</>;
        case 'SYNTHESIZE_REGION':
            return <>Synthesized <span className="font-bold text-gray-100">'{payload.newConceptName}'</span> from {payload.sourceConceptCount} concepts.</>;
        case 'ANALYZE_ARGUMENT':
             return <>Analyzed the argument between <span className="font-bold text-gray-100">'{payload.sourceName}'</span> and <span className="font-bold text-gray-100">'{payload.targetName}'</span>.</>;
        case 'FORMALIZE_ARGUMENT':
            const premiseText = payload.premiseNames ? `premises '${payload.premiseNames.join(', ')}'` : `premise '${payload.sourceName}'`;
            return <>Formalized the argument from {premiseText} to <span className="font-bold text-gray-100">'{payload.conclusionName || payload.targetName}'</span>.</>;
        case 'CREATE_LOGICAL_CONSTRUCT':
            return <>Created a logical construct for the argument concluding in <span className="font-bold text-gray-100">'{payload.conclusionName}'</span>.</>;
        case 'GENERATE_JUSTIFICATION':
            return <>Generated justification for the link between <span className="font-bold text-gray-100">'{payload.sourceName}'</span> and <span className="font-bold text-gray-100">'{payload.targetName}'</span>.</>;
        default:
            return <>{type}</>;
    }
};


const ProjectDiaryPanel: React.FC<ProjectDiaryPanelProps> = ({ isOpen, onClose, entries }) => {

    return (
        <div 
            className={`fixed top-0 left-0 h-full bg-black/80 backdrop-blur-md border-r border-gray-600 z-30 transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} w-96 flex flex-col`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="diary-title"
        >
            <div className="flex justify-between items-center p-4 border-b border-gray-600 flex-shrink-0">
                <h3 id="diary-title" className="text-lg font-bold text-cyan-300 flex items-center gap-2">
                    <DiaryIcon className="w-6 h-6"/>
                    Project Diary
                </h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close project diary">
                    <ChevronLeft className="w-6 h-6" />
                </button>
            </div>
            {entries.length > 0 ? (
                <ul className="p-2 overflow-y-auto flex-grow">
                    {entries.map(activity => (
                        <li key={activity.id} className="p-3 mb-1.5 bg-gray-800/50 rounded-md">
                            <div className="flex items-start gap-3">
                                <div className="mt-1 flex-shrink-0">
                                    <ActivityIcon type={activity.type} />
                                </div>
                                <div className="flex-grow">
                                    <p className="text-sm text-gray-300 leading-snug">
                                        <ActivityText activity={activity} />
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">{timeAgo(activity.timestamp)}</p>
                                    
                                    {activity.payload.provenance && (
                                        <details className="mt-2 text-xs group">
                                            <summary className="cursor-pointer text-gray-500 hover:text-gray-300 list-none group-open:text-gray-300 flex items-center gap-1">
                                                <ChevronLeft className="w-3 h-3 transition-transform transform group-open:-rotate-90" />
                                                Show Provenance
                                            </summary>
                                            <div className="mt-2 ml-2 pl-3 border-l border-gray-700 space-y-2">
                                                <div>
                                                    <h5 className="font-semibold text-gray-400">Model:</h5>
                                                    <p className="font-mono text-gray-500">{activity.payload.provenance.model}</p>
                                                </div>
                                                {activity.payload.provenance.systemInstruction && (
                                                     <div>
                                                        <h5 className="font-semibold text-gray-400">System Instruction:</h5>
                                                        <pre className="whitespace-pre-wrap font-mono text-gray-500 bg-black/30 p-1.5 rounded text-[11px]">{activity.payload.provenance.systemInstruction}</pre>
                                                    </div>
                                                )}
                                                <div>
                                                    <h5 className="font-semibold text-gray-400">Prompt:</h5>
                                                    <pre className="whitespace-pre-wrap font-mono text-gray-500 bg-black/30 p-1.5 rounded text-[11px] max-h-32 overflow-y-auto">{activity.payload.provenance.prompt}</pre>
                                                </div>
                                                <div>
                                                    <h5 className="font-semibold text-gray-400">Raw Response:</h5>
                                                    <pre className="whitespace-pre-wrap font-mono text-gray-500 bg-black/30 p-1.5 rounded text-[11px] max-h-40 overflow-y-auto">{activity.payload.provenance.rawResponse}</pre>
                                                </div>
                                            </div>
                                        </details>
                                    )}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="p-4 text-center text-gray-400 text-sm flex-grow flex flex-col items-center justify-center">
                    <BrainCircuit className="w-16 h-16 text-gray-600 mb-4" />
                    <p className="font-semibold">Your project activity will be logged here.</p>
                    <p className="mt-2 text-xs">Explore concepts, build your map, and track feeds to see your history unfold.</p>
                </div>
            )}
        </div>
    );
};

export default ProjectDiaryPanel;