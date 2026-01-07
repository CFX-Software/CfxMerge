export namespace main {
	
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

