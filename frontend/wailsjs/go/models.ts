export namespace main {
	
	export class Song {
	    title: string;
	    artist: string;
	    album: string;
	    filePath: string;
	    duration: string;
	    coverData?: string;
	    durationSec?: number;
	    position?: number;
	
	    static createFrom(source: any = {}) {
	        return new Song(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.artist = source["artist"];
	        this.album = source["album"];
	        this.filePath = source["filePath"];
	        this.duration = source["duration"];
	        this.coverData = source["coverData"];
	        this.durationSec = source["durationSec"];
	        this.position = source["position"];
	    }
	}
	export class Playlist {
	    name: string;
	    description: string;
	    folderPath: string;
	    songs: Song[];
	    coverData?: string;
	    position: number;
	
	    static createFrom(source: any = {}) {
	        return new Playlist(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.folderPath = source["folderPath"];
	        this.songs = this.convertValues(source["songs"], Song);
	        this.coverData = source["coverData"];
	        this.position = source["position"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Settings {
	    theme: string;
	    volume: number;
	    discordRPC: boolean;
	    showNotifications: boolean;
	    autoPlay: boolean;
	    shuffle: boolean;
	    repeat: string;
	    staticFolder: string;
	    language: string;
	    accentColor: string;
	    keyboardShortcuts: boolean;
	    minimizeToTray: boolean;
	    startMinimized: boolean;
	    showLyrics: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.volume = source["volume"];
	        this.discordRPC = source["discordRPC"];
	        this.showNotifications = source["showNotifications"];
	        this.autoPlay = source["autoPlay"];
	        this.shuffle = source["shuffle"];
	        this.repeat = source["repeat"];
	        this.staticFolder = source["staticFolder"];
	        this.language = source["language"];
	        this.accentColor = source["accentColor"];
	        this.keyboardShortcuts = source["keyboardShortcuts"];
	        this.minimizeToTray = source["minimizeToTray"];
	        this.startMinimized = source["startMinimized"];
	        this.showLyrics = source["showLyrics"];
	    }
	}

}

