
import { useState, useEffect, useMemo, useCallback } from 'react';
import { MultiProjectSession, Project, AppSessionData, MapLink, ProjectActivityType, ProjectActivity } from '../types';

const MULTI_PROJECT_SESSION_VERSION = 8;

const createNewProject = (name: string): Project => {
    return {
        id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name,
        data: {
            mapLayout: { nodes: [], links: [], logicalConstructs: [] },
            mapTrayConceptIds: [],
            trackedFeeds: [],
            seenPublicationIds: [],
            projectDiary: [],
        },
    };
};

const loadInitialSession = (): MultiProjectSession => {
    const savedSessionString = localStorage.getItem('multiProjectSession');
    if (savedSessionString) {
        try {
            const savedSession: MultiProjectSession = JSON.parse(savedSessionString);
            
            if (!savedSession.version || savedSession.version < MULTI_PROJECT_SESSION_VERSION) {
                 console.log(`Migrating session to v${MULTI_PROJECT_SESSION_VERSION}...`);
                 savedSession.projects.forEach((p: Project) => {
                    if (!p.data.projectDiary) { p.data.projectDiary = []; }
                    if (!p.data.mapLayout.logicalConstructs) { p.data.mapLayout.logicalConstructs = []; }
                    if (p.data.mapLayout && p.data.mapLayout.links) {
                        p.data.mapLayout.links = p.data.mapLayout.links.map((link: MapLink) => {
                             let newLink = { ...link };
                            if (newLink.relationshipType && !newLink.relationshipTypes) {
                                newLink.relationshipTypes = [newLink.relationshipType];
                                delete (newLink as Partial<MapLink>).relationshipType;
                            }
                             if (typeof newLink.justification === 'string') {
                                newLink.justification = { text: newLink.justification, citations: [] };
                            }
                            return newLink;
                        });
                    }
                 });
                 if (!savedSession.customRelationshipTypes) { savedSession.customRelationshipTypes = []; }
                 if (!savedSession.disabledDefaultTypes) { savedSession.disabledDefaultTypes = []; }
                 if (!savedSession.disabledCustomTypes) { savedSession.disabledCustomTypes = []; }
                 savedSession.version = MULTI_PROJECT_SESSION_VERSION;
                 console.log("Migration complete.");
            }
            
            if (savedSession.version === MULTI_PROJECT_SESSION_VERSION) {
                savedSession.projects.forEach((p: Project) => {
                    if (p.data?.trackedFeeds) {
                        p.data.trackedFeeds.forEach(feed => {
                            feed.isLoading = false;
                            feed.error = null;
                        });
                    }
                    if (!p.data.projectDiary) { p.data.projectDiary = []; }
                    if (!p.data.mapLayout.logicalConstructs) { p.data.mapLayout.logicalConstructs = []; }
                });
                
                if (!savedSession.customRelationshipTypes) { savedSession.customRelationshipTypes = []; }
                if (!savedSession.disabledDefaultTypes) { savedSession.disabledDefaultTypes = []; }
                if (!savedSession.disabledCustomTypes) { savedSession.disabledCustomTypes = []; }

                if (!savedSession.projects.some((p: Project) => p.id === savedSession.activeProjectId)) {
                    savedSession.activeProjectId = savedSession.projects[0]?.id || null;
                }
                return savedSession;
            }

        } catch (e) {
            console.error("Failed to parse or migrate multi-project session, resetting.", e);
        }
    }

    // Migration from single-session to multi-project
    console.log("No valid multi-project session found, attempting to migrate old data...");
    const oldMapLayout = JSON.parse(localStorage.getItem('mapLayout') || '{"nodes":[],"links":[],"logicalConstructs":[]}');
    
    if (oldMapLayout.links) {
        oldMapLayout.links = oldMapLayout.links.map((link: any) => ({
            source: link.source,
            target: link.target,
            pathStyle: link.pathStyle || (link.type ? 'straight' : 'straight'),
            relationshipTypes: [link.relationshipType || (link.type ? 'Unclassified' : 'Unclassified')],
            justification: typeof link.justification === 'string' ? { text: link.justification, citations: [] } : undefined,
        }));
    }
    if (!oldMapLayout.logicalConstructs) oldMapLayout.logicalConstructs = [];
    
    const defaultProject = createNewProject("Default Project");
    defaultProject.data = {
        mapLayout: oldMapLayout,
        mapTrayConceptIds: JSON.parse(localStorage.getItem('mapTrayConceptIds') || '[]'),
        trackedFeeds: JSON.parse(localStorage.getItem('trackedFeeds') || '[]'),
        seenPublicationIds: JSON.parse(localStorage.getItem('seenPublicationIds') || '[]'),
        projectDiary: [],
    };
    
    return {
        version: MULTI_PROJECT_SESSION_VERSION,
        activeProjectId: defaultProject.id,
        projects: [defaultProject],
        customRelationshipTypes: [],
        disabledDefaultTypes: [],
        disabledCustomTypes: [],
    };
};


export const useSessionManager = () => {
    const [session, setSession] = useState<MultiProjectSession>(loadInitialSession);

    useEffect(() => {
        localStorage.setItem('multiProjectSession', JSON.stringify(session));
    }, [session]);

    const activeProject = useMemo(() => {
        if (!session.activeProjectId) return null;
        return session.projects.find(p => p.id === session.activeProjectId) || session.projects[0] || null;
    }, [session]);

    const activeProjectData = useMemo<AppSessionData | null>(() => activeProject ? activeProject.data : null, [activeProject]);
    
    const updateActiveProjectData = useCallback((updater: (currentData: AppSessionData) => AppSessionData) => {
        setSession(prevSession => {
            if (!prevSession.activeProjectId) return prevSession;
            const newProjects = prevSession.projects.map(p => {
                if (p.id === prevSession.activeProjectId) {
                    return { ...p, data: updater(p.data) };
                }
                return p;
            });
            return { ...prevSession, projects: newProjects };
        });
    }, []);

    const logActivity = useCallback((type: ProjectActivityType, payload: { [key: string]: any }) => {
        if (!activeProject?.id) return;

        const newActivity: ProjectActivity = {
            id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            timestamp: Date.now(),
            type,
            payload,
        };
        updateActiveProjectData(d => ({
            ...d,
            projectDiary: [newActivity, ...d.projectDiary],
        }));
    }, [activeProject?.id, updateActiveProjectData]);

    const handleCreateProject = useCallback((name: string) => {
        const newProject = createNewProject(name);
        setSession(prev => ({
            ...prev,
            projects: [...prev.projects, newProject],
            activeProjectId: newProject.id
        }));
    }, []);

    const handleSwitchProject = useCallback((projectId: string) => {
        setSession(prev => ({ ...prev, activeProjectId: projectId }));
    }, []);

    const handleDeleteProject = useCallback((projectId: string) => {
        setSession(prev => {
            const remainingProjects = prev.projects.filter(p => p.id !== projectId);
            if (remainingProjects.length === 0) {
                const newProject = createNewProject("Default Project");
                return { ...prev, projects: [newProject], activeProjectId: newProject.id };
            }
            const newActiveProjectId = prev.activeProjectId === projectId
                ? remainingProjects[0].id
                : prev.activeProjectId;
            return { ...prev, projects: remainingProjects, activeProjectId: newActiveProjectId };
        });
    }, []);

    const handleRenameProject = useCallback((projectId: string, newName: string) => {
        setSession(prev => ({
            ...prev,
            projects: prev.projects.map(p => p.id === projectId ? { ...p, name: newName } : p)
        }));
    }, []);

    return {
        session,
        setSession,
        activeProject,
        activeProjectData,
        updateActiveProjectData,
        logActivity,
        handleCreateProject,
        handleSwitchProject,
        handleDeleteProject,
        handleRenameProject,
    };
};
