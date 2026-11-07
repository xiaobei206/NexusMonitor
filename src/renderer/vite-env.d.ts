/// <reference types="vite/client" />

interface Window {
  nexus: {
    getSettings(): Promise<any>;
    getMusicState(): Promise<import('../shared/types').MusicState>;
    showMusicLibrary(): Promise<boolean>;
    onOpenMusicLibrary(callback:()=>void):()=>void;
    chooseMusicFiles(): Promise<{added:number;skipped:number}>;
    chooseMusicFolder(): Promise<{added:number;skipped:number;truncated?:boolean}>;
    getMusicTrackUrl(trackId:string): Promise<string | null>;
    getMusicArtworkUrl(trackId:string): Promise<string | null>;
    getMusicLyrics(trackId:string): Promise<import('../shared/types').MusicLyricLine[]>;
    musicCommand(command:import('../shared/types').MusicCommand):Promise<import('../shared/types').MusicState>;
    reportMusicRuntime(payload:{currentTime?:number;duration?:number;playing?:boolean;error?:boolean;errorMessage?:string}):void;
    onMusicState(callback:(state:import('../shared/types').MusicState)=>void):()=>void;
    onMusicEngineCommand(callback:(command:{type:'seek';seconds:number;resume?:boolean})=>void):()=>void; saveSettings(settings: Record<string, unknown>): Promise<any>; onSettingsUpdated(callback: (settings: Record<string, unknown>) => void): () => void; getWeatherKeyStatus(source:string):Promise<{configured:boolean}>; saveWeatherApiKey(source:string,key:string):Promise<{ok:boolean;configured?:boolean;message?:string}>; setStartup(value:boolean): Promise<boolean>;
    getSnapshot(): Promise<any>; getSnapshotResult(): Promise<import('../shared/types').SnapshotResult>; getDevices(): Promise<any>; getWeather(): Promise<any>;
    chooseBackground(): Promise<string | null>; openPath(path: string): Promise<string>; openUrl(url: string): Promise<void>;
    showMain(): Promise<void>; minimize(): Promise<void>; close(): Promise<void>; toggleMaximize(): Promise<boolean>;
    setAlwaysOnTop(value: boolean): Promise<boolean>; toggleWidget(): Promise<void>; showWidget(): Promise<void>;
    setWidgetExpanded(expanded: boolean): Promise<boolean>; notifyWidgetDetailRendererReady(): void; notifyMainRendererReady(): void; notifyWidgetDetailPointer(inside:boolean):Promise<boolean>; openWidgetCalendar(): Promise<boolean>; closeWidgetCalendar(): Promise<boolean>; moveWidgetTo(position: {x:number;y:number}): Promise<boolean>;
    snapWidgetToEdge(): Promise<'left'|'right'|'top'|'bottom'|null>; hideWidgetToEdge(): Promise<boolean>; revealWidgetFromEdge(): Promise<boolean>;
    setWidgetAlwaysOnTop(value:boolean):Promise<boolean>;
    onWidgetEdgeState(callback:(state:{edge:'left'|'right'|'top'|'bottom'|null;hidden:boolean})=>void):()=>void;
    onWidgetDetailState(callback:(visible:boolean)=>void):()=>void;
    onWidgetDetailFadeOut(callback:()=>void):()=>void;
    onWidgetDetailFadeCancel(callback:()=>void):()=>void;
    listPlugins(): Promise<any[]>; importPlugin(): Promise<any>; setPluginEnabled(payload:{id:string;enabled:boolean}):Promise<any[]>;
    getTuringDevices(): Promise<any>;
    chooseTuringWallpaperFile(): Promise<{path:string;name:string}|null>;
    chooseTuringWallpaperDirectory(): Promise<{path:string;files:Array<{path:string;name:string}>;message:string|null}|null>;
    listTuringWallpaperFiles(directory:string): Promise<{files:Array<{path:string;name:string}>;message:string|null}>;
    readTuringWallpaper(path:string): Promise<{ok:boolean;path?:string;name?:string;mime?:string;dataUrl?:string;message?:string}>;
    connectTuring(payload: {port?: string; orientation?: number}): Promise<any>;
    disconnectTuring(): Promise<any>; setTuringOrientation(orientation: number): Promise<any>;
    setTuringBrightness(brightness: number): Promise<any>; setTuringScreenPower(on: boolean): Promise<any>; setTuringVisualVerified(verified: boolean): Promise<any>;
    pushTuringPatches(payload: {patches: Array<{x:number;y:number;width:number;height:number;dataBase64:string}>}): Promise<any>;
    getDesktopDisplays(): Promise<Array<{id:string;index:number;primary:boolean;width:number;height:number;x:number;y:number;scaleFactor:number;label:string}>>;
    getUsbDisplayStatus(): Promise<{open:boolean;targetDisplayId:string|null}>;
    openUsbDisplay(displayId:string): Promise<{ok:boolean;message?:string;status?:{open:boolean;targetDisplayId:string|null}}>;
    closeUsbDisplay(): Promise<{open:boolean;targetDisplayId:string|null}>;
    chooseUsbDisplayMedia(kind:'image'|'video'): Promise<{path:string;name:string}|null>;
    readUsbDisplayImage(path:string): Promise<{ok:boolean;name?:string;dataUrl?:string;message?:string}>;
    getUsbDisplayVideoUrl(path:string): Promise<{ok:boolean;name?:string;url?:string;message?:string}>;
    onDesktopDisplaysChanged(callback:(displays:Array<{id:string;index:number;primary:boolean;width:number;height:number;x:number;y:number;scaleFactor:number;label:string}>)=>void):()=>void;
    onUsbDisplayStatusChanged(callback:(status:{open:boolean;targetDisplayId:string|null})=>void):()=>void;
    onTelemetry(callback: (data: any) => void): () => void; onWeather(callback: (data: any) => void): () => void;
    onServiceState(callback: (state: string) => void): () => void;
    onServiceStatus(callback: (status: import('../shared/types').ServiceStatus) => void): () => void;
  };
}
