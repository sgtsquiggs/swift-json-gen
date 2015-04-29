//
// Several functions for generating Swift code based on the parsed AST.
//

var ast = require('./SwiftAst')

function makeFile(file: any[], aliases: TypeAliases, filename: string) {
  var lines = [];

  lines.push('//');
  lines.push('//  ' + filename);
  lines.push('//');
  lines.push('//  Auto generated by swift-json-gen on ' + new Date().toUTCString());
  lines.push('//');
  lines.push('');
  lines.push('import Foundation');
  lines.push('');

  var structs = ast.structs(file, aliases);
  structs.forEach(function (s) {
    lines = lines.concat(makeExtension(s));
    lines.push('');
  });

  return lines;
}

exports.makeFile = makeFile;

function makeExtension(struct: Struct) {
  var pre = [
    'extension ' + struct.baseName + ' {',
    '  static func decode' + decodeArguments(struct) + ' -> ' + struct.baseName + '? {',
    '    let _dict = json as? [String : AnyObject]',
    '    if _dict == nil { return nil }',
    '    let dict = _dict!',
    '',
  ];
  var post = [
    '  }',
    '}'
  ];

  var lines = pre;

  struct.varDecls.forEach(function (d) {
    var subs = makeField(d, struct.typeArguments).map(indent(4));
    lines = lines.concat(subs);
  });

  lines = lines.concat(indent(4)(makeReturn(struct)));
  lines = lines.concat(post);

  return lines.join('\n');
}

function decodeArguments(struct: Struct) : string {
  var parts = struct.typeArguments
    .map(t => 'decode' + t + ': AnyObject -> ' + t + '?')

  parts.push('json: AnyObject');

  for (var i = 1; i < parts.length; i++) {
    parts[i] = '_ ' + parts[i];
  }

  return parts.map(p => '(' + p + ')').join('');
}

function indent(nr) {
  return function (s) {
    return s == '' ? s :  Array(nr + 1).join(' ') + s;
  };
}

function isKnownType(type: string) : boolean {
  return type == 'AnyObject' || type == 'AnyJson';
}

function isCastType(type: string) : boolean {
  return type == 'JsonObject' || type == 'JsonArray';
}

function decodeFunction(type: Type, decoders: string[]) : string {
  var args = type.genericArguments
    .map(a => decodeFunctionArgument(a, decoders))
    .join('');

  var typeName = type.alias || type.baseName;

  if (isKnownType(typeName))
    return '{ $0 as ' + typeName + ' }';

  if (isCastType(typeName))
    return '{ $0 as? ' + typeName + ' }';

  if (decoders.indexOf(typeName) > -1)
    return 'decode' + typeName + args

  return typeName + '.decode' + args;
}

function decodeFunctionArgument(type: Type, decoders: string[]) : string {

  if (isKnownType(type.baseName))
    return '{ $0 as ' + type.baseName + ' }';

  if (isCastType(type.baseName))
    return '{ $0 as? ' + type.baseName + ' }';

  return '({ ' + decodeFunction(type, decoders) + '($0) })'
}

function typeToString(type: Type) : string {
  if (type.genericArguments.length == 0)
    return type.baseName;

  if (type.baseName == 'Optional')
    return typeToString(type.genericArguments[0]) + '?';

  if (type.baseName == 'Array')
    return '[' + typeToString(type.genericArguments[0]) + ']';

  if (type.baseName == 'Dictionary')
    return '[' + typeToString(type.genericArguments[0]) + ' : ' + typeToString(type.genericArguments[1]) + ']';

  var args = type.genericArguments.map(typeToString).join(', ')
  return type.baseName + '<' + args + '>';
}

function makeField(field: VarDecl, structTypeArguments: string[]) {
  var name = field.name;
  var type = field.type;
  var fieldName = name + '_field';
  var valueName = name + '_value';
  var typeString = typeToString(type);

  var lines = [
    'let ' + fieldName + ': AnyObject? = dict["' + name + '"]',
  ];

  if (type.baseName == 'Optional') {
    lines.push('let ' + name + ': ' + typeString + ' = ' + fieldName + ' == nil ? nil : ' + decodeFunction(type, structTypeArguments) + '(' + fieldName + '!)')
  }
  else {
    lines.push('if ' + fieldName + ' == nil { assertionFailure("field \'' + name + '\' is missing"); return nil }');

    if (isKnownType(type.baseName)) {
      lines.push('let ' + name + ': ' + typeString + ' = ' + fieldName + '!');
    }
    else if (isCastType(type.baseName)) {
      lines.push('let ' + valueName + ': ' + typeString + '? = ' + fieldName + '! as? ' + typeString)
      lines.push('if ' + valueName + ' == nil { assertionFailure("field \'' + name + '\' is not ' + typeString + '"); return nil }');
      lines.push('let ' + name + ': ' + typeString + ' = ' + valueName + '!');
    }
    else {
      lines.push('let ' + valueName + ': ' + typeString + '? = ' + decodeFunction(type, structTypeArguments    ) + '(' + fieldName + '!)')
      lines.push('if ' + valueName + ' == nil { assertionFailure("field \'' + name + '\' is not ' + typeString + '"); return nil }');
      lines.push('let ' + name + ': ' + typeString + ' = ' + valueName + '!');
    }
  }

  lines.push('');

  return lines;
}

function makeReturn(struct: Struct) {
  var params = struct.varDecls.map(decl => decl.name + ': ' + decl.name);

  return 'return ' + struct.baseName + '(' + params.join(', ') + ')'
}

