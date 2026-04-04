export interface ExhibitionConfig {
  id: string;
  name: string;
  nameKo?: string;
  description: string;
  descriptionKo?: string;
  artist?: string;
  roomShape: 'rectangular' | 'L-shaped' | 'corridor';
  roomWidth?: number;
  roomDepth?: number;
  wallHeight?: number;
  ambientMusicUrl?: string;
  artworks: ArtworkConfig[];
}

export interface ArtworkConfig {
  id: string;
  imageUrl: string;
  title: string;
  titleKo?: string;
  description?: string;
  descriptionKo?: string;
  artist: string;
  year?: string;
  width: number;
  height: number;
  wall?: 'north' | 'south' | 'east' | 'west';
  position?: number;
  frameStyle?: 'classic' | 'modern' | 'none';
  frameColor?: string;
}

export type CameraState =
  | 'WALKING'
  | 'TRANSITIONING_TO_ARTWORK'
  | 'VIEWING_ARTWORK'
  | 'TRANSITIONING_BACK';

export interface WallSegment {
  id: 'north' | 'south' | 'east' | 'west';
  width: number;
  height: number;
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  rotation: number;
}
