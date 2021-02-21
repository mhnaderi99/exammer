const fs = require('fs-extra');
const path = require('path');
const chokidar = require('chokidar');
const glob = require('fast-glob');
const minimatch = require("minimatch");
const isValidPath = require('is-valid-path');
const gulp = require('gulp');
const babel = require("@babel/core");
const sass = require('node-sass');
const sassJsonImporter = require('node-sass-json-importer');
const nunjucks = require('nunjucks');
const revHash = require('rev-hash');
const minify = require('gulp-minifier');

const paths = {
    base: '.',
    source: {
        base: 'src',
        fonts: 'src/fonts',
        images: 'src/images',
        components: 'src/components',
        js: 'src/js',
        js_bundle: 'src/js/bundle',
        sass: 'src/sass',
        pages: 'src/pages',
        partials: 'src/pages/partials',
        style: 'src/style.json',
        manifest: 'src/rev-manifest.json',
		gitignore: '.gitignore'
    },
    dist: {
        base: 'dist/public',
        resources: 'dist/public/resources',
        fonts: 'dist/public/resources/fonts',
        images: 'dist/public/resources/images',
        js: 'dist/public/resources/js',
        css: 'dist/public/resources/css'
    }
};

function Details(fp) {
    let wholeName = path.basename(fp);
    let dot = wholeName.indexOf('.');
    return {
        absolute: path.resolve(fp).replace(path.win32.sep, path.posix.sep),
        dirname: path.dirname(fp).replace(path.win32.sep, path.posix.sep),
        filename: wholeName.slice(0, dot),
        ext: wholeName.slice(dot)
    };
}

function Rename(oldname, data) {
    let dot = oldname.indexOf('.');
    let ext = oldname.slice(dot);
    if(typeof data.ext === 'string') {
        ext = data.ext.startsWith('.') ? data.ext : '.' + data.ext;
    }
    let filename = oldname.slice(0, dot);
    if(typeof data.filename === 'string') {
        filename = data.filename;
    }
    return filename + ext;
}

class Pile {
    constructor(fp, data=null) {
        this.path = fp;
        this.contents = Buffer.from('');
        if(Buffer.isBuffer(data)) {
            this.contents = data;
        } else if(typeof data == 'string') {
            this.contents = Buffer.from(data);
        } else if(fs.pathExistsSync(fp)) {
            this.contents = fs.readFileSync(fp);
        }
    }
    get path() {
        return this._p;
    }
    set path(value) {
        this._p = value.replace(path.win32.sep, path.posix.sep);
        this.details = Details(this.path);
    }
}

class Fipe {
    constructor() {
        this.piles = [];
        this.base = path.resolve('.');
    }
}

Fipe.Read = function(src, opt) {
    let default_opt = {
        base: null
    };
    let o = {...default_opt, ...opt};
    let _this = new Fipe();
    if(typeof o.base === 'string') {
        _this.base = o.base;
    }
    if(isValidPath(src)) {
        let pile = new Pile(src);
        _this.piles = [pile];
    } else {
        for(let fp of glob.sync(src)) {
            let pile = new Pile(fp);
            _this.piles = Array.prototype.concat(_this.piles, pile);
        }
    }
    return _this;
};

Fipe.prototype.Save = function(dest, opt) {
    let default_opt = {
        ext: null,
        removeDirs: false,
        revision: false,
        manifest: 'rev-manifest.json',
    };
    let o = {...default_opt, ...opt};
    let newPiles = [];
    for(let pile of this.piles) {
        let dir = path.relative(this.base, pile.details.dirname);
        if(o.removeDirs) {
            dir = '';
        }
        let ext = pile.details.ext;
        if(typeof o.ext === 'string') {
            ext = o.ext.startsWith('.') ? o.ext : '.' + o.ext;
        }
        let fname = pile.details.filename;
        let revision = '';
        if(o.revision === true) {
            try {
                revision = '-' + revHash(pile.contents);
            } catch (e) {}
        }
        let outputName = path.join(dest, dir, fname + revision + ext);
        fs.outputFileSync(outputName, pile.contents);
        if(o.revision === true) {
            let manifest = fs.readJSONSync(o.manifest, {throws: false}) || {};
            manifest[pile.details.filename + pile.details.ext] = fname + revision + ext;
            fs.outputJsonSync(o.manifest, manifest);
        }
        let newPile = new Pile(outputName, pile.contents);
        newPiles = Array.prototype.concat(newPiles, newPile);
    }
    this.piles = newPiles;
    return this;
};

Fipe.prototype.Delete = function(dest, opt) {
    let default_opt = {
        removeDirs: false,
        ext: null,
        revision: false
    };
    let o = {...default_opt, ...opt};
    let regs = [];
    for(let pile of this.piles) {
        let dir = path.relative(this.base, pile.details.dirname);
        if(o.removeDirs) {
            dir = '';
        }
        dir = dir.split(path.win32.sep).join(path.posix.sep);
        let ext = pile.details.ext;
        if(typeof o.ext === 'string') {
            ext = o.ext.startsWith('.') ? o.ext : '.' + o.ext;
        }
        ext = ext.split('.').join('\\.');
        let fname = pile.details.filename;
        let revision = '';
        if(o.revision === true) {
            revision = '-[0-9a-f]{10}';
        }
        regs = Array.prototype.concat(regs, RegExp(dir + fname + revision + ext + '$'));
    }
    fs.ensureDirSync(dest);
    for(let fp of glob.sync(`${dest}/**/*.*`)) {
        if(regs.map(re => re.test(fp)).reduce((a, b) => a || b)) {
            fs.unlinkSync(fp);
        }
    }
    return this;
};

Fipe.prototype.Rename = function(data) {
    let newPiles = [];
    for(let pile of this.piles) {
        newPiles = Array.prototype.concat(
            newPiles,
            new Pile(Rename(pile.path, data), pile.contents));
    }
    this.piles = newPiles;
    return this;
};

Fipe.prototype.Concat = function(name, opt) {
    let default_opt = {
        bom: true
    };
    let o = {...default_opt, ...opt};
    let contents = Buffer.from('');
    for(let pile of this.piles) {
        contents = Buffer.concat([
            contents,
            pile.contents,
            Buffer.from('\n')
        ]);
    }

    if(o.bom === true) {
        contents = Buffer.concat([
            new Uint8Array([0xEF, 0xBB, 0xBF]),
            contents
        ]);
    }
    this.piles = [
        new Pile(path.join(this.base, name), contents)
    ];
    return this;
};

Fipe.prototype.Minify = function(opt) {
    let default_opt = {};
    let o = {...default_opt, ...opt};
    let minify_options = {
        minify: true,
        minifyHTML: {
            caseSensitive: true,
            collapseWhitespace: true,
            conservativeCollapse: true
        },
        minifyJS: true,
        minifyCSS: {
            compatibility: {
                colors: {
                    opacity: true
                },
                properties: {
                    colors: false
                }
            }
        },
        getKeptComment: function (content, __) {
            let m = content.match(/\/\*![\s\S]*?\*\//img);
            return m && m.join('\n') + '\n' || '';
        }
    };
    let newPiles = [];
    for(let pile of this.piles) {
        let newPile = new Pile(
            pile.path,
            minify.minify({
                    path: pile.path,
                    contents: pile.contents},
                minify_options).contents);
        newPiles = Array.prototype.concat(newPiles, newPile);
    }
    this.piles = newPiles;
    return this;
};

Fipe.prototype.CompileSass = function(opt) {
    let default_opt = {
        jsonPath: null
    };
    let o = {...default_opt, ...opt};
    let newPiles = [];
    for(let pile of this.piles) {
        if(typeof o.jsonPath === 'string') {
            pile.contents = Buffer.concat([
                Buffer.from(`@import "${
                    path.relative(this.base, o.jsonPath)
                        .split(path.win32.sep)
                        .join(path.posix.sep)}";\n`),
                pile.contents]);
        }
        let importer = [];
        if(typeof o.jsonPath === 'string' && fs.pathExistsSync(o.jsonPath) && fs.readJsonSync(o.jsonPath, {throws: false})) {
            importer = [sassJsonImporter({'isScss': true, 'cache': false})];
        }
        let newPile = new Pile(
            Rename(pile.path, {ext: '.css'}),
            sass.renderSync({
                file: pile.path,
                data: pile.contents.toString(),
                includePaths: [this.base],
                importer: importer
            }).css
        );
        newPiles = Array.prototype.concat(newPiles, newPile);
    }
    this.piles = newPiles;
    return this;
};

Fipe.prototype.CompileJs = function(opt) {
    let default_opt = {
        jsonPath: null
    };
    let o = {...default_opt, ...opt};
    let newPiles = [];
    let style = Buffer.from('');
    if(typeof o.jsonPath === 'string') {
        style = fs.readFileSync(o.jsonPath);
    }
    for(let pile of this.piles) {
        let contents = pile.contents.toString();
        if(typeof o.jsonPath === 'string') {
            contents = contents.replace(
                '/*{{ STYLE.JSON }}*/',
                `style = ${style};`);
        }
        let newPile = new Pile(
            pile.path,
            Buffer.from(contents)
        );
        newPiles = Array.prototype.concat(newPiles, newPile);
    }
    this.piles = newPiles;
    return this;
};

Fipe.prototype.CompileNjk = function(opt) {
    let default_opt = {
        manifest: null
    };
    let o = {...default_opt, ...opt};
    let manifest = {};
    if(typeof o.manifest === 'string') {
        manifest = fs.readJSONSync(o.manifest, {throws: false}) || {};
    }
    let newPiles = [];
    for(let pile of this.piles) {
        let _base = this.base;
        let globLoader = nunjucks.Loader.extend({
            getSource: function (name) {
                let p;
                if(fs.pathExistsSync(name)) {
                    p = name;
                } else if(fs.pathExistsSync(path.resolve(path.join(pile.details.dirname, name)))) {
                    p = path.resolve(path.join(pile.details.dirname, name));
                } else if(fs.pathExistsSync(path.resolve(path.join(_base, name)))) {
                    p = path.resolve(path.join(_base, name));
                } else {
                    return {
                        'src': '',
                        'path': ''
                    };
                }
                return {
                    'src': fs.readFileSync(p, 'utf8'),
                    'path': p
                };
            }
        });
        let nunjucksCompiler = new nunjucks.Environment(new globLoader());
        let contents = nunjucksCompiler.renderString(pile.contents.toString(), {pagename: pile.details.filename});
        if(typeof o.manifest === 'string') {
            for(const [pre, post] of Object.entries(manifest)) {
                contents = contents.split(pre).join(post);
            }
        }
        let newPile = new Pile(
            Rename(pile.path, {ext: '.html'}),
            Buffer.from(contents)
        );
        newPiles = Array.prototype.concat(newPiles, newPile);
    }
    this.piles = newPiles;
    return this;
};

/*////////////////////////////////////////////////////////////////////////*/
/*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*/
/*||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||*/
/*////////////////////////////////////////////////////////////////////////*/
/*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*/

function InitialCleanUp() {
    fs.emptyDirSync(paths.dist.base);
    fs.removeSync(paths.source.manifest);
    fs.ensureFileSync(paths.source.manifest);
    fs.ensureFileSync(paths.source.style);
    console.log('Initial cleanup finished');
}

function HandleFonts(e, fp) {
    if(e === 'unlink') {
        Fipe.Read(fp, {base: paths.source.fonts})
            .Delete(paths.dist.fonts, {removeDirs: true});
        console.log(`Deleted ${path.basename(fp)}`);
    } else if(['add', 'change'].includes(e)) {
        Fipe.Read(fp, {base: paths.source.fonts})
            .Save(paths.dist.fonts, {removeDirs: true});
        console.log(`Added ${path.basename(fp)}`);
    }
}

function HandleFontsCSS() {
    Fipe.Read(`${paths.source.fonts}/**/*.css`, {base: paths.source.fonts})
        .Concat('fonts.css')
        .CompileSass()
        .Minify()
        .Delete(paths.dist.fonts,
            {removeDirs: true,
                revision: true,
                ext: 'min.css'})
        .Save(paths.dist.fonts,
            {removeDirs: true,
                revision: true,
                ext: 'min.css',
                manifest: paths.source.manifest});
    console.log('Compiled fonts.css');
}

function HandleImages(e, fp) {
    if(e === 'unlink') {
        Fipe.Read(fp, {base: paths.source.images})
            .Delete(paths.dist.images, {removeDirs: true});
        console.log(`Deleted ${path.basename(fp)}`);
    } else if(['add', 'change'].includes(e)) {
        Fipe.Read(fp, {base: paths.source.images})
            .Save(paths.dist.images, {removeDirs: true});
        console.log(`Added ${path.basename(fp)}`);
    }
}

function HandleComponentsSASS() {
    Fipe.Read(`${paths.source.components}/**/*.scss`, {base: paths.source.components})
        .Concat('components.scss')
        .CompileSass({jsonPath: paths.source.style})
        .Minify()
        .Delete(paths.dist.css,
            {removeDirs: true,
                revision: true,
                ext: 'min.css'})
        .Save(paths.dist.css,
            {removeDirs: true,
                revision: true,
                ext: 'min.css',
                manifest: paths.source.manifest});
    console.log('Compiled components.css');
}

function HandleComponentsJS() {
    Fipe.Read(`${paths.source.components}/**/*.js`, {base: paths.source.components})
        .Concat('components.js')
        .CompileJs({jsonPath: paths.source.style})
        .Minify()
        .Delete(paths.dist.js,
            {removeDirs: true,
                revision: true,
                ext: 'min.js'})
        .Save(paths.dist.js,
            {removeDirs: true,
                revision: true,
                ext: 'min.js',
                manifest: paths.source.manifest});
    console.log('Compiled components.js');
}

function HandlePageSASS(e, fp) {
    if(e === 'unlink') {
        Fipe.Read(fp, {base: paths.source.pages})
            .Delete(paths.dist.css,
                {removeDirs: true,
                    revision: true,
                    ext: 'min.css'});
        console.log(`Deleted ${path.basename(Rename(fp, {ext: 'css'}))}`);
    } else if(['add', 'change'].includes(e)) {
        Fipe.Read(fp, {base: paths.source.pages})
            .CompileSass({jsonPath: paths.source.style})
            .Minify()
            .Delete(paths.dist.css,
                {removeDirs: true,
                    revision: true,
                    ext: 'min.css'})
            .Save(paths.dist.css,
                {removeDirs: true,
                    revision: true,
                    ext: 'min.css',
                    manifest: paths.source.manifest});
        console.log(`Added ${path.basename(Rename(fp, {ext: 'css'}))}`);
    }
}

function HandlePageJS(e, fp) {
    if(e === 'unlink') {
        Fipe.Read(fp, {base: paths.source.pages})
            .Delete(paths.dist.js,
                {removeDirs: true,
                    revision: true,
                    ext: 'min.js'});
        console.log(`Deleted ${path.basename(Rename(fp, {ext: 'js'}))}`);
    } else if(['add', 'change'].includes(e)) {
        Fipe.Read(fp, {base: paths.source.pages})
            .CompileJs({jsonPath: paths.source.style})
            .Minify()
            .Delete(paths.dist.js,
                {removeDirs: true,
                    revision: true,
                    ext: 'min.js'})
            .Save(paths.dist.js,
                {removeDirs: true,
                    revision: true,
                    ext: 'min.js',
                    manifest: paths.source.manifest});
        console.log(`Added ${path.basename(Rename(fp, {ext: 'js'}))}`);
    }
}

function HandlePageNJK(e, fp) {
    let log = '';
    if(e === undefined && fp === undefined) {
        e = 'change';
        fp = [`${paths.source.pages}/**/*.njk`, `!${paths.source.partials}/**/*.njk`];
        log = 'Compiled html pages';
    }
    if(e === 'unlink') {
        Fipe.Read(fp, {base: paths.source.pages})
            .Delete(paths.dist.base,
                {removeDirs: true,
                    ext: 'html'});
        if(log === '') {
            log = `Deleted ${path.basename(Rename(fp, {ext: 'html'}))}`;
        }
    } else if(['add', 'change'].includes(e)) {
        Fipe.Read(fp, {base: paths.source.pages})
            .CompileNjk({manifest: paths.source.manifest})
            .Minify()
            .Save(paths.dist.base,
                {removeDirs: true,
                    ext: 'html'});
        if(log === '') {
            log = `Added ${path.basename(Rename(fp, {ext: 'html'}))}`;
        }
    }
    console.log(log);
}

function HandleSASS(e, fp) {
    if(e === 'unlink') {
        Fipe.Read(fp, {base: paths.source.sass})
            .Delete(paths.dist.css,
                {revision: true,
                    ext: 'min.css'});
        console.log(`Deleted ${path.basename(Rename(fp, {ext: 'css'}))}`);
    } else if(['add', 'change'].includes(e)) {
        Fipe.Read(fp, {base: paths.source.sass})
            .CompileSass({jsonPath: paths.source.style})
            .Minify()
            .Delete(paths.dist.css,
                {revision: true,
                    ext: 'min.css'})
            .Save(paths.dist.css,
                {revision: true,
                    ext: 'min.css',
                    manifest: paths.source.manifest});
        console.log(`Added ${path.basename(Rename(fp, {ext: 'css'}))}`);
    }
}

function HandleJS(e, fp) {
    if(e === 'unlink') {
        Fipe.Read(fp, {base: paths.source.js})
            .Delete(paths.dist.js,
                {revision: true,
                    ext: 'min.js'});
        console.log(`Deleted ${path.basename(Rename(fp, {ext: 'js'}))}`);
    } else if(['add', 'change'].includes(e)) {
        Fipe.Read(fp, {base: paths.source.js})
            .CompileJs({jsonPath: paths.source.style})
            .Minify()
            .Delete(paths.dist.js,
                {revision: true,
                    ext: 'min.js'})
            .Save(paths.dist.js,
                {revision: true,
                    ext: 'min.js',
                    manifest: paths.source.manifest});
        console.log(`Added ${path.basename(Rename(fp, {ext: 'js'}))}`);
    }
}

function HandleJSBundle() {
    Fipe.Read(`${paths.source.js_bundle}/**/*.js`, {base: paths.source.js_bundle})
        .Concat('bundle.js')
        .CompileJs({jsonPath: paths.source.style})
        .Minify()
        .Delete(paths.dist.js,
            {removeDirs: true,
                revision: true,
                ext: 'min.js'})
        .Save(paths.dist.js,
            {removeDirs: true,
                revision: true,
                ext: 'min.js',
                manifest: paths.source.manifest});
    console.log('Compiled bundle.js');
}

function init() {
	fs.ensureDirSync(paths.source.base);
	fs.ensureDirSync(paths.source.fonts);
	fs.ensureDirSync(paths.source.images);
	fs.ensureDirSync(paths.source.components);
	fs.ensureDirSync(paths.source.pages);
	fs.ensureDirSync(paths.source.partials);
	fs.ensureDirSync(paths.source.sass);
	fs.ensureDirSync(paths.source.js);
	fs.ensureDirSync(paths.source.js_bundle);
	fs.ensureFileSync(paths.source.style);
	let style = fs.readJSONSync(paths.source.style, {throws: false}) || {};
	fs.writeJSONSync(paths.source.style, style);
	fs.ensureFileSync(paths.source.manifest);
	fs.ensureFileSync(paths.source.gitignore);
	let gitignore = fs.readFileSync(paths.source.gitignore).toString().split('\r\n').filter(s => s);
	for(let p of ['.*/', `${paths.dist.base}/*`, 'node_modules/*', paths.source.manifest]) {
        if(!gitignore.includes(p)) {
            gitignore = Array.prototype.concat(gitignore, p);
        }
    }
	fs.writeFileSync(paths.source.gitignore, gitignore.join('\r\n') + '\r\n');
    console.log('Done');
    if(typeof arguments[0] === 'function')
        arguments[0]();
}

function watch() {
    InitialCleanUp();
    this.watcher = chokidar.watch(paths.source.base, {});
    this.watcher.on('all', (e, fp) => {
        fp = fp.split(path.win32.sep).join(path.posix.sep);
        setTimeout(() => {
            if(minimatch(fp, `${paths.source.fonts}/**/*.!(css)`)) {
                HandleFonts(e, fp);
            } else if(minimatch(fp, `${paths.source.fonts}/**/*.css`)) {
                HandleFontsCSS();
                HandlePageNJK();
            } else if(minimatch(fp, `${paths.source.images}/**/*.*`)) {
                HandleImages(e, fp);
            } else if(minimatch(fp, `${paths.source.components}/**/*.scss`)) {
                HandleComponentsSASS();
                HandlePageNJK();
            } else if(minimatch(fp, `${paths.source.components}/**/*.js`)) {
                HandleComponentsJS();
                HandlePageNJK();
            } else if(minimatch(fp, `${paths.source.pages}/**/*.scss`)) {
                HandlePageSASS(e, fp);
                HandlePageNJK(e, Rename(fp, {ext: 'njk'}));
            } else if(minimatch(fp, `${paths.source.pages}/**/*.js`)) {
                HandlePageJS(e, fp);
                HandlePageNJK(e, Rename(fp, {ext: 'njk'}));
            } else if(minimatch(fp, `${paths.source.partials}/**/*.njk`)) {
                HandlePageNJK();
            } else if(minimatch(fp, `${paths.source.pages}/**/*.njk`) && !minimatch(fp, `${paths.source.partials}/**/*.njk`)) {
                HandlePageNJK(e, fp);
            } else if(minimatch(fp, `${paths.source.sass}/**/*.scss`)) {
                HandleSASS(e, fp);
                HandlePageNJK();
            } else if(minimatch(fp, `${paths.source.js_bundle}/**/*.js`)) {
                HandleJSBundle();
                HandlePageNJK();
            } else if(minimatch(fp, `${paths.source.js}/**/*.js`) && !minimatch(fp, `${paths.source.js_bundle}/**/*.js`)) {
                HandleJS(e, fp);
                HandlePageNJK();
            }
            if(['unlink', 'unlinkDir'].includes(e)) {
                for(let dir of glob.sync(`${paths.dist.base}/**/*`,
                    {onlyDirectories: true})) {
                    if(fs.readdirSync(dir).length === 0) {
                        fs.removeSync(dir);
                    }
                }
            }
        }, 200);
    });
}

function build() {
    InitialCleanUp();
    for(let fp of glob.sync(`${paths.source.base}/**/*.*`, {onlyFiles: true})) {
        fp = fp.split(path.win32.sep).join(path.posix.sep);
        let e = 'add';
        if(minimatch(fp, `${paths.source.fonts}/**/*.!(css)`)) {
            HandleFonts(e, fp);
        } else if(minimatch(fp, `${paths.source.fonts}/**/*.css`)) {
            HandleFontsCSS();
            HandlePageNJK();
        } else if(minimatch(fp, `${paths.source.images}/**/*.*`)) {
            HandleImages(e, fp);
        } else if(minimatch(fp, `${paths.source.components}/**/*.scss`)) {
            HandleComponentsSASS();
            HandlePageNJK();
        } else if(minimatch(fp, `${paths.source.components}/**/*.js`)) {
            HandleComponentsJS();
            HandlePageNJK();
        } else if(minimatch(fp, `${paths.source.pages}/**/*.scss`)) {
            HandlePageSASS(e, fp);
            HandlePageNJK(e, Rename(fp, {ext: 'njk'}));
        } else if(minimatch(fp, `${paths.source.pages}/**/*.js`)) {
            HandlePageJS(e, fp);
            HandlePageNJK(e, Rename(fp, {ext: 'njk'}));
        } else if(minimatch(fp, `${paths.source.partials}/**/*.njk`)) {
            HandlePageNJK();
        } else if(minimatch(fp, `${paths.source.pages}/**/*.njk`) && !minimatch(fp, `${paths.source.partials}/**/*.njk`)) {
            HandlePageNJK(e, fp);
        } else if(minimatch(fp, `${paths.source.sass}/**/*.scss`)) {
            HandleSASS(e, fp);
            HandlePageNJK();
        } else if(minimatch(fp, `${paths.source.js_bundle}/**/*.js`)) {
            HandleJSBundle();
            HandlePageNJK();
        } else if(minimatch(fp, `${paths.source.js}/**/*.js`) && !minimatch(fp, `${paths.source.js_bundle}/**/*.js`)) {
            HandleJS(e, fp);
            HandlePageNJK();
        }
    }
    console.log('Done');
    if(typeof arguments[0] === 'function')
        arguments[0]();
}

gulp.task('init', init);
gulp.task('default', watch);
gulp.task('build', build);
