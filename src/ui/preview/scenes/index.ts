import type { Scene } from '../engine';
import type { SceneId } from '../timeline';
import { embedScenes } from './embeds';
import { inserterScenes } from './inserter';
import { moduleScenes } from './modules';

// typed as a full record so a scene id without a scene is a compile error
export const SCENES = Object.fromEntries([...moduleScenes, ...inserterScenes, ...embedScenes].map((s) => [s.id, s])) as Record<SceneId, Scene>;
