let gulp = require('gulp');
let rollup = require('rollup').rollup;
let nodeResolve = require('rollup-plugin-node-resolve');
let commonjs = require('rollup-plugin-commonjs');
let uglify = require('rollup-plugin-uglify');
let rollupAngular = require('rollup-plugin-angular');
let rollupTypescript = require('rollup-plugin-typescript');
let sass = require('gulp-sass');
let concat = require('gulp-concat');
let rev = require('gulp-rev');
let inject = require('gulp-inject');
let exec = require('child_process').exec;
let argv = require('yargs').argv;
let del = require('del');
let typescript = require('typescript');
let browserSync = require('browser-sync').create();

let prodMode = argv.prod;

//Build TODOs
//vendor css
//css source maps
//exit on error in build mode. not in watch mode
//Clean aot and generated files in src

function componentStyles() {
    let sassOptions = {outputStyle: prodMode ? 'compressed' : 'nested'};

    return gulp.src(['src/**/*.scss', '!src/globalSass/**'])
        .pipe(sass(sassOptions).on('error', sass.logError))
        .pipe(gulp.dest('src'));
}

function ngc(done) {
    exec('"node_modules/.bin/ngc" -p "tsconfig.prod.json"', function(error, stdout, stderr) {
        stdout && console.log(stdout);
        stderr && console.error(stderr);
        done();
    });
}

let rollUpBundle;
let rollupApp = gulp.series(
    function cleanRollupJs() {return del(['dist/app*.js', 'dist/app*.js.map'])},
    function buildRollupApp() {
        let sharedPlugins = [
            nodeResolve({jsnext: true}),
            commonjs({include: 'node_modules/rxjs/**'})
        ];

        let devPlugins = [
            rollupAngular(),
            //TODO: figure out why logs from typescript aren't showing up
            rollupTypescript({typescript: typescript}),
            ...sharedPlugins
        ];

        let prodPlugins = [...sharedPlugins, uglify()];

        let rollupConfig = {
            entry: prodMode ? 'src/main.prod.js': 'src/main.dev.ts',
            //cache: rollUpBundle,
            //treeshake: false,
            plugins: prodMode ? prodPlugins : devPlugins,
            onwarn: function (warning) {
                if(warning.code === 'THIS_IS_UNDEFINED') {
                    return;
                }
                console.warn('rollupwarn', warning.message);
            }
        };

        return rollup(rollupConfig)
            .then((bundle) => {
                rollUpBundle = bundle;

                return bundle.write({
                    format: 'iife',
                    dest: `dist/app-${Date.now().toString(36)}.js`,
                    sourceMap: !prodMode
                });
            });
    }
);

let globalJs = gulp.series(
    function cleanGlobalJs() {return del('dist/global*.js')},
    function BuildGlobalJs() {

        return gulp.src([
            'node_modules/core-js/client/shim.min.js',
            'node_modules/zone.js/dist/zone.min.js'
        ])
            .pipe(concat('global.js'))
            .pipe(rev())
            .pipe(gulp.dest('dist'));
    }
);

let globalSass = gulp.series(
    function cleanGlobalSass() {return del('dist/global*.css')},
    function BuildGlobalSass() {
        let sassOptions = {outputStyle: prodMode ? 'compressed' : 'nested'};

        return gulp.src('src/globalSass/global.scss')
            .pipe(sass(sassOptions).on('error', sass.logError))
            .pipe(rev())
            .pipe(gulp.dest('dist'));
    }
);


function index() {
    let srcStream = gulp.src(['dist/global*.js', 'dist/app*.js', 'dist/global*.css'], {read: false});

    return gulp.src('src/index.html')
        .pipe(inject(srcStream, {addRootSlash: false, ignorePath: 'dist'}))
        .pipe(gulp.dest('dist'));
}

function clean() {
    return del('dist');
}

function reloadBrowser(done) {
    browserSync.reload();
    done();
}

gulp.task('componentStyles', componentStyles);
gulp.task('ngc', ngc);
gulp.task('rollupApp', rollupApp);
gulp.task('globalJs', globalJs);
gulp.task('globalSass', globalSass);
gulp.task('index', index);

let appJs;
if(prodMode) {
    appJs = gulp.series(componentStyles, ngc, rollupApp);
} else {
    appJs = gulp.series(componentStyles, rollupApp);
}

let build = gulp.series(clean, gulp.parallel(appJs, globalJs, globalSass), index);

gulp.task('default', gulp.series(build, function watch() {
    let componentStylePaths = ['src/**/*.scss', '!src/globalSass/**'];
    let componentTemplatePaths = ['src/**/*.html', '!src/index.html'];

    gulp.watch(['src/**/*.ts', ...componentStylePaths, ...componentTemplatePaths], gulp.series(appJs, index, reloadBrowser));
    gulp.watch('src/globalSass/**/*.scss', gulp.series(globalSass, index, reloadBrowser));
    gulp.watch('src/index.html', gulp.series(index, reloadBrowser));

    browserSync.init(null, {
        proxy: 'localhost:5000'
    });
}));