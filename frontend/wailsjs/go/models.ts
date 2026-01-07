export namespace main {
	
	export class APIKeyInfo {
	    createdAt: number;
	    lastUsedAt: number;
	    currentUsage: number;
	
	    static createFrom(source: any = {}) {
	        return new APIKeyInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.createdAt = source["createdAt"];
	        this.lastUsedAt = source["lastUsedAt"];
	        this.currentUsage = source["currentUsage"];
	    }
	}
	export class Limit {
	    endpoint: string;
	    requestsPerHour: number;
	    requestsPerDay: number;
	    maxBatchSize: number;
	
	    static createFrom(source: any = {}) {
	        return new Limit(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.endpoint = source["endpoint"];
	        this.requestsPerHour = source["requestsPerHour"];
	        this.requestsPerDay = source["requestsPerDay"];
	        this.maxBatchSize = source["maxBatchSize"];
	    }
	}
	export class Stats {
	    conversions: number;
	    completedConversions: number;
	    downloads: number;
	    credits: string;
	    accountTier: string;
	    isPremium: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Stats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.conversions = source["conversions"];
	        this.completedConversions = source["completedConversions"];
	        this.downloads = source["downloads"];
	        this.credits = source["credits"];
	        this.accountTier = source["accountTier"];
	        this.isPremium = source["isPremium"];
	    }
	}
	export class User {
	    id: string;
	    name: string;
	    email: string;
	    image: string;
	    discordId: string;
	
	    static createFrom(source: any = {}) {
	        return new User(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.email = source["email"];
	        this.image = source["image"];
	        this.discordId = source["discordId"];
	    }
	}
	export class AuthResponse {
	    user: User;
	    tier: string;
	    stats: Stats;
	    limits: Limit[];
	    apiKey: APIKeyInfo;
	
	    static createFrom(source: any = {}) {
	        return new AuthResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.user = this.convertValues(source["user"], User);
	        this.tier = source["tier"];
	        this.stats = this.convertValues(source["stats"], Stats);
	        this.limits = this.convertValues(source["limits"], Limit);
	        this.apiKey = this.convertValues(source["apiKey"], APIKeyInfo);
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
	export class FileInfo {
	    path: string;
	    name: string;
	    size: number;
	    modTime: string;
	    isEncrypted: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FileInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.size = source["size"];
	        this.modTime = source["modTime"];
	        this.isEncrypted = source["isEncrypted"];
	    }
	}
	export class DuplicateGroup {
	    id: string;
	    name: string;
	    status: string;
	    files: FileInfo[];
	    paths: string[];
	    expanded: boolean;
	    selected: boolean;
	    hasWarnings?: boolean;
	    warningCount?: number;
	
	    static createFrom(source: any = {}) {
	        return new DuplicateGroup(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.status = source["status"];
	        this.files = this.convertValues(source["files"], FileInfo);
	        this.paths = source["paths"];
	        this.expanded = source["expanded"];
	        this.selected = source["selected"];
	        this.hasWarnings = source["hasWarnings"];
	        this.warningCount = source["warningCount"];
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
	
	
	

}

