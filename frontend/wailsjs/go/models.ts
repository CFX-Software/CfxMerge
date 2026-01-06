export namespace main {
	
	export class DuplicateGroup {
	    id: string;
	    name: string;
	    status: string;
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
	        this.paths = source["paths"];
	        this.expanded = source["expanded"];
	        this.selected = source["selected"];
	        this.hasWarnings = source["hasWarnings"];
	        this.warningCount = source["warningCount"];
	    }
	}
	export class FileInfo {
	    path: string;
	    name: string;
	    size: number;
	    modTime: string;
	
	    static createFrom(source: any = {}) {
	        return new FileInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.size = source["size"];
	        this.modTime = source["modTime"];
	    }
	}

}

