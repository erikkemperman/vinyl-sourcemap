'use strict';

var fs = require('fs');
var path = require('path');
var File = require('vinyl');
var test = require('tape');
var sourcemaps = require('..');
var stream = require('stream');
var util = require('util');
var recordConsole = require('./consolerecorder.js');

var sourceContent = fs.readFileSync(path.join(__dirname, 'assets/helloworld.js')).toString();

function makeSourceMap() {
	return {
		version: 3,
		file: 'helloworld.js',
		names: [],
		mappings: '',
		sources: ['helloworld.js'],
		sourcesContent: [sourceContent]
	};
}

function makeFile(addSourcemap) {
	if (addSourcemap === undefined) {
		addSourcemap = true;
	}
	var file = new File({
		cwd: __dirname,
		base: path.join(__dirname, 'assets'),
		path: path.join(__dirname, 'assets', 'helloworld.js'),
		contents: new Buffer(sourceContent)
	});
	if (addSourcemap === true) {
		file.sourceMap = makeSourceMap();
	}
	return file;
}

function makeNestedFile(){
	var file = new File({
		cwd: __dirname,
		base: path.join(__dirname, 'assets'),
		path: path.join(__dirname, 'assets', 'dir1', 'dir2', 'helloworld.js'),
		contents: new Buffer(sourceContent)
	});
	file.sourceMap = makeSourceMap();
	return file;
}

function base64JSON(object) {
	return 'data:application/json;charset=utf8;base64,' + new Buffer(JSON.stringify(object)).toString('base64');
}

test('write: should return an error when no valid vinyl file is provided', function (t) {
	[
		{ type: 'undefined' },
		{ type: 'null', val: null },
		{ type: 'an object', val: {} },
		{ type: 'a stream', val: new stream.Readable() }
	].map(function (obj) {
		sourcemaps.write(obj.val, function(err, data) {
			t.ok(err instanceof Error && err.message === 'vinyl-sourcemap-write: Not a vinyl file', util.format('should not accept %s as first argument', obj.type));
		});
	});
	t.end();
});

test('write: should return an error when no sourcemap is found on the file', function (t) {
	var file = makeFile(false);
	sourcemaps.write(file, function (err, data) {
		t.ok(err instanceof Error && err.message === 'vinyl-sourcemap-write: No sourcemap found', 'should not accept a file without a sourcemap');
		t.end();
	});
});

test('write: should return an error when invalid arguments are provided', function (t) {
	var file = makeFile();
	[
		{ type: 'undefined' },
		{ type: 'null', val: null },
		{ type: 'a boolean', val: true }
	].map(function(obj) {
		sourcemaps.write(file, obj.val, function(err, data) {
			t.ok(err instanceof Error && err.message === 'vinyl-sourcemap-write: Invalid arguments', util.format('should not accept %s as second argument with a callback as third', obj.type));
		});
	});
	t.end();
});

test('write: should return an error when invalid options are provided', function (t) {
	var file = makeFile();
	[
		{ type: 'undefined' },
		{ type: 'null', val: null },
		{ type: 'a string', val: '' },
		{ type: 'a boolean', val: true }
	].map(function(obj) {
		sourcemaps.write(file, 'test', obj.val, function(err, data) {
			t.ok(err instanceof Error && err.message === 'vinyl-sourcemap-write: Invalid argument: options', util.format('should not accept %s as options argument', obj.type));
		});
	});
	t.end();
});

test('write: should write an inline source map', function (t) {
	var file = makeFile();
	sourcemaps.write(file, function(err, data) {
		var updatedFile = data[0];
		t.ok(data && data.length === 1, 'should return an array containing the file');
		t.ok(updatedFile instanceof File, 'should pass a vinyl file through');
		t.deepEqual(updatedFile, file, 'should not change file');
		t.equal(String(updatedFile.contents),
			sourceContent + '\n//# sourceMappingURL=' + base64JSON(updatedFile.sourceMap) + '\n',
			'should add source map as comment');
		t.end();
	});
});

test('write: should use CSS comments if CSS file', function (t) {
	var file = makeFile();
	file.path = file.path.replace('.js', '.css');
	sourcemaps.write(file, function(err, data) {
		var updatedFile = data[0];
		t.equal(String(updatedFile.contents),
			sourceContent + '\n/*# sourceMappingURL=' + base64JSON(updatedFile.sourceMap) + ' */\n',
			'should add source map with CSS comment');
		t.end();
	});
});

test('write: should write no comment if not JS or CSS file', function (t) {
	var file = makeFile();
	file.path = file.path.replace('.js', '.txt');
	sourcemaps.write(file, function(err, data) {
		var updatedFile = data[0];
		t.equal(String(updatedFile.contents), sourceContent);
		t.end();
	});
});

test('write: should detect whether a file uses \\n or \\r\\n and follow the existing style', function (t) {
	var file = makeFile();
	file.contents = new Buffer(file.contents.toString().replace(/\n/g, '\r\n'));
	sourcemaps.write(file, function(err, data) {
		var updatedFile = data[0];
		t.ok(updatedFile, 'should pass something through');
		t.equal(String(updatedFile.contents),
			sourceContent.replace(/\n/g, '\r\n') +
			'\r\n//# sourceMappingURL=' + base64JSON(updatedFile.sourceMap) + '\r\n',
			'should add source map as comment');
		t.end();
	});
});

test('write: should write external map files', function (t) {
	var file = makeFile();
	sourcemaps.write(file, '../maps', { destPath: 'dist' }, function(err, data) {
		var updatedFile = data[0],
			sourceMap = data[1];
		t.ok(updatedFile instanceof File, 'should pass a vinyl file through');
		t.deepEqual(updatedFile, file, 'should not change file');
		t.equal(String(updatedFile.contents),
			sourceContent + '\n//# sourceMappingURL=../maps/helloworld.js.map\n',
			'should add a comment referencing the source map file');
		t.equal(updatedFile.sourceMap.file, '../dist/helloworld.js');
		t.ok(sourceMap instanceof File, 'should pass a vinyl file through');
		t.equal(sourceMap.path, path.join(__dirname, 'maps/helloworld.js.map'));
		t.deepEqual(JSON.parse(sourceMap.contents), updatedFile.sourceMap, 'should have the file\'s source map as content');
		t.equal(sourceMap.stat.isFile(), true, 'should have correct stats');
		t.equal(sourceMap.stat.isDirectory(), false, 'should have correct stats');
		t.equal(sourceMap.stat.isBlockDevice(), false, 'should have correct stats');
		t.equal(sourceMap.stat.isCharacterDevice(), false, 'should have correct stats');
		t.equal(sourceMap.stat.isSymbolicLink(), false, 'should have correct stats');
		t.equal(sourceMap.stat.isFIFO(), false, 'should have correct stats');
		t.equal(sourceMap.stat.isSocket(), false, 'should have correct stats');
	});
	t.end();
});

test('write: should allow to rename map file', function(t) {
	var file = makeFile();
	sourcemaps.write(file, '../maps', { mapFile: function(mapFile) {
		return mapFile.replace('.js.map', '.map');
	}, destPath: 'dist' }, function(err, data) {
		var updatedFile = data[0],
			sourceMap = data[1];
		t.ok(updatedFile instanceof File, 'should pass a vinyl file through');
		t.deepEqual(updatedFile, file, 'should not change file');
		t.equal(String(updatedFile.contents),
			sourceContent + '\n//# sourceMappingURL=../maps/helloworld.map\n',
			'should add a comment referencing the source map file');
		t.equal(updatedFile.sourceMap.file, '../dist/helloworld.js');
		t.ok(sourceMap instanceof File, 'should pass a vinyl file through');
		t.equal(sourceMap.path, path.join(__dirname, 'maps/helloworld.map'));
		t.deepEqual(JSON.parse(sourceMap.contents), updatedFile.sourceMap, 'should have the file\'s source map as content');
		t.end();
	});
});

test('write: should create shortest path to map in file comment', function(t) {
	var file = makeNestedFile();
	sourcemaps.write(file, 'dir1/maps', function(err, data) {
		var updatedFile = data[0],
			sourceMap = data[1];
		t.equal(String(updatedFile.contents),
			sourceContent + '\n//# sourceMappingURL=../maps/dir1/dir2/helloworld.js.map\n',
			'should add a comment referencing the source map file');
		t.end();
	});
});

test('write: should write no comment with option addComment=false', function(t) {
	var file = makeFile();
	sourcemaps.write(file, { addComment: false }, function(err, data) {
		var updatedFile = data[0];
		t.equal(String(updatedFile.contents), sourceContent, 'should not change file content');
		t.end();
	});
});

test('write: should not include source content with option includeContent=false', function(t) {
	var file = makeFile();
	sourcemaps.write(file, { includeContent: false }, function(err, data) {
		var updatedFile = data[0];
		t.equal(updatedFile.sourceMap.sourcesContent, undefined, 'should not have source content');
		t.end();
	});
});

test('write: should fetch missing sourceContent', function(t) {
	var file = makeFile();
	delete file.sourceMap.sourcesContent;
	sourcemaps.write(file, function(err, data) {
		var updatedFile = data[0];
		t.notEqual(updatedFile.sourceMap.sourcesContent, undefined, 'should have source content');
		t.deepEqual(updatedFile.sourceMap.sourcesContent, [sourceContent], 'should have correct source content');
		t.end();
	});
});

test('write: should not throw when unable to fetch missing sourceContent', function(t) {
	var file = makeFile();
	file.sourceMap.sources[0] += '.invalid';
	delete file.sourceMap.sourcesContent;
	sourcemaps.write(file, function(err, data) {
		var updatedFile = data[0];
		t.notEqual(updatedFile.sourceMap.sourcesContent, undefined, 'should have source content');
		t.deepEqual(updatedFile.sourceMap.sourcesContent, [], 'should have correct source content');
		t.end();
	});
});

test('write: should set the sourceRoot by option sourceRoot', function(t) {
	var file = makeFile();
	sourcemaps.write(file, { sourceRoot: '/testSourceRoot' }, function(err, data) {
		var updatedFile = data[0];
		t.equal(updatedFile.sourceMap.sourceRoot, '/testSourceRoot', 'should set sourceRoot');
		t.end();
	});
});

test('write: should set the sourceRoot by option sourceRoot, as a function', function(t) {
	var file = makeFile();
	sourcemaps.write(file, {
		sourceRoot: function(file) {
			return '/testSourceRoot';
		}
	}, function(err, data) {
		var updatedFile = data[0];
		t.equal(updatedFile.sourceMap.sourceRoot, '/testSourceRoot', 'should set sourceRoot');
		t.end();
	});
});

test('write: should automatically determine sourceRoot if destPath is set', function(t) {
	var file = makeNestedFile();
	sourcemaps.write(file, '.', { destPath: 'dist', includeContent: false }, function(err, data) {
		var updatedFile = data[0],
			sourceMap = data[1];
		t.equal(updatedFile.sourceMap.sourceRoot, '../../../assets', 'should set correct sourceRoot');
		t.equal(updatedFile.sourceMap.file, 'helloworld.js');
		t.equal(sourceMap.path, path.join(__dirname, 'assets/dir1/dir2/helloworld.js.map'));
		t.end();
	});
});

test('write: should interpret relative path in sourceRoot as relative to destination', function(t) {
	var file = makeNestedFile();
	sourcemaps.write(file, '.', { sourceRoot: '../src' }, function(err, data) {
		var updatedFile = data[0],
			sourceMap = data[1];
		t.equal(updatedFile.sourceMap.sourceRoot, '../../../src', 'should set relative sourceRoot');
		t.equal(updatedFile.sourceMap.file, 'helloworld.js');
		t.equal(sourceMap.path, path.join(__dirname, 'assets/dir1/dir2/helloworld.js.map'));
		t.end();
	});
});

test('write: should interpret relative path in sourceRoot as relative to destination (part 2)', function(t) {
	var file = makeNestedFile();
	sourcemaps.write(file, '.', { sourceRoot: '' }, function(err, data) {
		var updatedFile = data[0],
			sourceMap = data[1];
		t.equal(updatedFile.sourceMap.sourceRoot, '../..', 'should set relative sourceRoot');
		t.equal(updatedFile.sourceMap.file, 'helloworld.js');
		t.equal(sourceMap.path, path.join(__dirname, 'assets/dir1/dir2/helloworld.js.map'));
		t.end();
	});
});

test('write: should interpret relative path in sourceRoot as relative to destination (part 3)', function(t) {
	var file = makeNestedFile();
	sourcemaps.write(file, 'maps', { sourceRoot: '../src' }, function(err, data) {
		var updatedFile = data[0],
			sourceMap = data[1];
		t.equal(updatedFile.sourceMap.sourceRoot, '../../../../src', 'should set relative sourceRoot');
		t.equal(updatedFile.sourceMap.file, '../../../dir1/dir2/helloworld.js');
		t.equal(sourceMap.path, path.join(__dirname, 'assets/maps/dir1/dir2/helloworld.js.map'));
		t.end();
	});
});

test('write: should interpret relative path in sourceRoot as relative to destination (part 4)', function(t) {
	var file = makeNestedFile();
	sourcemaps.write(file, '../maps', { sourceRoot: '../src', destPath: 'dist' }, function(err, data) {
		var updatedFile = data[0],
			sourceMap = data[1];
		t.equal(updatedFile.sourceMap.sourceRoot, '../../../src', 'should set relative sourceRoot');
		t.equal(updatedFile.sourceMap.file, '../../../dist/dir1/dir2/helloworld.js');
		t.equal(sourceMap.path, path.join(__dirname, 'maps/dir1/dir2/helloworld.js.map'));
		t.end();
	});
});

test('write: should accept a sourceMappingURLPrefix', function(t) {
	var file = makeFile();
	sourcemaps.write(file, '../maps', {
		sourceMappingURLPrefix: 'https://asset-host.example.com'
	}, function(err, data) {
		var updatedFile = data[0];
		if (/helloworld\.js$/.test(updatedFile.path)) {
			t.equal(String(updatedFile.contents).match(/sourceMappingURL.*\n$/)[0],
				'sourceMappingURL=https://asset-host.example.com/maps/helloworld.js.map\n');
			t.end();
		}
	});
});

test('write: should accept a sourceMappingURLPrefix, as a function', function(t) {
	var file = makeFile();
	sourcemaps.write(file, '../maps', {
		sourceMappingURLPrefix: function(file) {
			return 'https://asset-host.example.com';
		}
	}, function(err, data) {
		var updatedFile = data[0];
		if (/helloworld\.js$/.test(updatedFile.path)) {
			t.equal(String(updatedFile.contents).match(/sourceMappingURL.*\n$/)[0],
				'sourceMappingURL=https://asset-host.example.com/maps/helloworld.js.map\n');
			t.end();
		}
	});
});

test('write: should output an error message if debug option is set and sourceContent is missing', function(t) {
	var file = makeFile();
	file.sourceMap.sources[0] += '.invalid';
	delete file.sourceMap.sourcesContent;
	var hConsole = recordConsole();
	sourcemaps.write(file, { debug: true }, function(err, data) {
		hConsole.restore();
		t.equal(hConsole.history.log[0], 'vinyl-sourcemap-write: No source content for "helloworld.js.invalid". Loading from file.', 'should log missing source content');
		t.ok(hConsole.history.warn[0].indexOf('vinyl-sourcemap-write: source file not found: ') === 0, 'should warn about missing file');
		t.end();
	});
});

test('write: null as sourceRoot should not set the sourceRoot', function(t) {
	var file = makeFile();
	sourcemaps.write(file, { sourceRoot: null }, function(err, data) {
		var updatedFile = data[0];
		t.equal(updatedFile.sourceMap.sourceRoot, undefined, 'should not set sourceRoot');
		t.end();
	});
});

test('write: function returning null as sourceRoot should not set the sourceRoot', function(t) {
	var file = makeFile();
	sourcemaps.write(file, {
		sourceRoot: function(file) {
			return null;
		}
	}, function(err, data) {
		var updatedFile = data[0];
		t.equal(updatedFile.sourceMap.sourceRoot, undefined, 'should set sourceRoot');
		t.end();
	});
});

test('write: empty string as sourceRoot should be kept', function(t) {
	var file = makeFile();
	sourcemaps.write(file, { sourceRoot: '' }, function(err, data) {
		var updatedFile = data[0];
		t.equal(updatedFile.sourceMap.sourceRoot, '', 'should keep empty string as sourceRoot');
		t.end();
	});
});

test('write: should be able to fully control sourceMappingURL by the option sourceMappingURL', function(t) {
	var file = makeNestedFile();
	sourcemaps.write(file, '../aaa/bbb/', {
		sourceMappingURL: function(file) {
			return 'http://maps.example.com/' + file.relative + '.map';
		}
	}, function(err, data) {
		var updatedFile = data[0];
		if (/helloworld\.js$/.test(updatedFile.path)) {
			t.equal(String(updatedFile.contents),
				sourceContent + '\n//# sourceMappingURL=http://maps.example.com/dir1/dir2/helloworld.js.map\n',
				'should add source map comment with custom url');
			t.end();
		}
	});
});

test('write: should allow to change sources', function(t) {
	var file = makeFile();
	sourcemaps.write(file, {
		mapSources: function(sourcePath) {
			return '../src/' + sourcePath;
		}
	}, function(err, data) {
		var updatedFile = data[0];
		t.deepEqual(updatedFile.sourceMap.sources, ['../src/helloworld.js'], 'should have the correct sources');
		t.end();
	});
});
