/*
Copyright 2014 Roi Avidan

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/


/****************************** ODKParser ******************************/


/**
 * Constructor. Initialize a new parser instance capable of parsing, validating and returning a list of form elements.
 *
 * @object formElementsFactory Factory instance for generating HTML form elements from Control objects.
 * @return Nothing.
 */
function ODKParser(formElementsFactory) {

    this.ns = '';
    this.translations = {'_default_': null};
    this.factory = formElementsFactory;
    this.factory.setParser(this);
    this.fields = {};
    this.controls = [];
}

/**
 * Load XForm file from string.
 *
 * @string xml XML string of XForm to load.
 *
 * @return Boolean value indicating whether the XML was successfully loaded.
 */
ODKParser.prototype.loads = function(xml) {

    try {
        // Use Browser's DOM parser to load XML
        var dom = new DOMParser().parseFromString(xml.trim(), 'text/xml');

        // Check for syntax errors
        var temp = dom.getElementsByTagName("parsererror");
        if (temp.length > 0) {
            temp = temp[0].getElementsByTagName('div');
            var err = [];

            for (var i = 0; i < temp.length; i++)
                err.push(temp[i].innerText.trim());

            throw err.join(', ');
        }

        // Check for XML version and encoding
        if (dom.xmlEncoding != 'UTF-8')
            throw 'XML Encoding must be UTF-8';
        if (dom.xmlVersion != '1.0')
            throw 'XML Version must be 1.0';

        // Validate ODK XML schema
        this._validateSchema(dom);

        this._parseControls();
        return true;
    } catch (e) {
        console.log('Error parsing XML: ' + e);
        return false;
    }
}

/**
 * Get the XForm's Title.
 *
 * @return Title string or an empty string, if none was specified.
 */
ODKParser.prototype.getTitle = function() {

    var temp = this.head.getElementsByTagNameNS(this.ns, 'title');
    if (temp.length == 1)
        return temp[0].innerText;

    return '';
}

/**
 * Get a list of elements built using a factory instance.
 *
 * @return Array of elements built by factory.
 */
ODKParser.prototype.getFormElements = function() {

    var elems = [];
    for (var i = 0; i < p.controls.length; i++) {
        var elem = this.factory.GetElementFromControl(p.controls[i]);
        if (elem != null)
            elems.push(elem);
    }

    return elems;
}

/**
 * Find a control identified by it's full path.
 *
 * @string path Control path to lookup.
 * @return Control instance or null if not found.
 */
ODKParser.prototype.findControl = function(path) {

    for (var i = 0; i < this.controls.length; i++)
        if (this.controls[i].req == path)
            return this.controls[i];

    return null;
}

/**
 * Private method. Parse the XForm defined controls.
 */
ODKParser.prototype._parseControls = function() {

    var self = this;
    var recursiveHelper = function(node, path, list, parentGroup) {

        if (node.children.length > 0) {

            if (path != '') {

                if (node.nodeName == 'group') {
                    var q = new ControlGroup(self.translations, node);
                    list.push(q);
                    list = q.list
                    parentGroup = q;
                } else if (node.nodeName == 'repeat') {
                    var q = parentGroup;
                    q.repeat = true;
                    var ref = node.getAttribute('nodeset');
                    if (ref[0] != '/')
                        ref = path + '/' + ref;
                    list = q.list;
                    path = ref
                } else {
                    var q = new Control(self.translations, node, path, self.fields);
                    path = q.ref;
                    list.push(q);
                    return;
                }
            } else {
                path = self.basePath;
            }

            for (var i = 0; i < node.children.length; i++)
                recursiveHelper(node.children[i], path, list, parentGroup);
        }
    }

    recursiveHelper(this.body, '', this.controls);
}

/**
 * Private method. Parse the XForm fields and translations.
 */
ODKParser.prototype._loadDefinitions = function() {

    var self = this;

    var resolvePath = function(path, basePath) {

        // Do not temper with absolute xpaths
        if (path[0] == '/')
            return path;

        // Is it one level up?
        if (path.substr(0, 3) == '../')
            return basePath.substr(0, basePath.lastIndexOf('/')) + path.substr(2);
        
        // Is it the same level?
        if (path.substr(0, 2) == './')
            path = path.substr(2);

        // Is it a dot reference to self?
        if (path == '.')
            return basePath;

        // Same level!
        return basePath + '/' + path;
    }

    var unescape = function(html) {

        var div = document.createElement('div');
        div.innerHTML = html;
        return div.innerText;
    }

    var parseOneCondition = function(str, currentPath) {

        // Replace HTML entities for lower and greater
        var cond = unescape(str);

        // Try to match simple functions
        var temp = /^(concat|uuid)\((.*)\)$/.exec(cond);
        if (temp != null) {
            var parts = temp[2];
            var args = [];
            while (parts.indexOf(',') != -1) {
                args.push(parseOneCondition(parts.substr(0, parts.indexOf(',')).replace(/^['"]|['"]$/g, ''), currentPath));
                parts = parts.substr(parts.indexOf(',')+1).trim();
            }
            if (parts != '')
                args.push(parseOneCondition(parts.replace(/^['"]|['"]$/g, ''), currentPath));
            return {'cond':true, 'expr':temp[1], 'args':args};
        } else {
            // Try to match an IF expression
            temp = /^if\((.+?),\s*(.+?),\s*(.+?)\)$/.exec(cond);
            if (temp != null) {
                conds = parseConditions(parseAndOr(temp[1]), currentPath);
                var t = parseConditions(temp[2].replace(/^['"]|['"]$/g, ''), currentPath);
                var f = parseConditions(temp[3].replace(/^['"]|['"]$/g, ''), currentPath);
                return {'cond':'if', 'expr':conds, 'true':t[0], 'false':f[0]};
            } else {
                // Try to match the "select equal expression"
                temp = /^(selected|regex)\((.+?),\s*(.+?)\)$/.exec(cond);
                if (temp != null) {
                    return {'cond':temp[1] == 'regex' ? '~' : '=', 'path':resolvePath(temp[2], currentPath), 'value':temp[3].replace(/^['"]|['"]$/g, '')};
                } else {
                    // Try to match a generic expression
                    temp = /^(.+?)\s*([<>=]+)\s*(.+?)$/.exec(cond);
                    if (temp != null) {
                        // Try to match either a simple or a function expression
                        var expr = /^(.+?)\((.+?)\)$/.exec(temp[1]);
                        if (expr == null) {
                            return {'cond':temp[2], 'path':resolvePath(temp[1], currentPath), 'value':temp[3].replace(/^['"]|['"]$/g, '')};
                        } else {
                            var path = resolvePath(expr[2], currentPath);
                            return {'cond':temp[2], 'path':path, 'value':temp[3].replace(/^['"]|['"]$/g, ''), 'expr':expr[1]};
                        }
                    }
                }
            }
        }

        return cond;
    }

    var parseAndOr = function(str) {

        var result = [];
        var ORs = str.split('or');
        for (var i = 0; i < ORs.length; i++) {

            var ANDs = ORs[i].trim().split('and');
            for (var j = 0; j < ANDs.length; j++)
                ANDs[j] = ANDs[j].trim();
            result.push(ANDs.length == 1 ? ANDs[0] : ANDs);
        }

        return result;
    }

    var parseConditions = function(and_or_arr, currentPath) {

        if (typeof and_or_arr == 'string')
            and_or_arr = [and_or_arr];

        var result = [];
        for (var i = 0; i < and_or_arr.length; i++) {

            var cond = and_or_arr[i];
            if (typeof cond == 'string') {
                result.push(parseOneCondition(cond.replace(/^['"]|['"]$/g, ''), currentPath));
            } else {
                var temp = [];
                for (var j = 0; j < ANDs.length; j++)
                    temp.push(parseOneCondition(ANDs[j].replace(/^['"]|['"]$/g, ''), currentPath));
                result.push(temp);
            }
        }

        return result;
    }

    var recursiveHelper = function(node, path, fields) {

        if (path == '')
            self.basePath = '/' + node.nodeName;

        var elem = {'path':path+'/'+node.nodeName};
        fields[elem['path']] = elem;
        if (node.children.length > 0) {
            elem['container'] = true;
            for (var i = 0; i < node.children.length; i++)
                recursiveHelper(node.children[i], elem['path'], fields);
        } else if (node.firstChild != null) {
            elem['default'] = node.firstChild.nodeValue;
            elem['type'] = 'string';
        } else {
            elem['default'] = null;
            elem['type'] = 'string';
        }
    }

    // Find instance node
    var instance = this.head.getElementsByTagName('instance');
    if (instance.length == 0)
        throw 'Invalid XForm - no instance defined'
    instance = instance[0];

    // Find first instance child
    if (instance.children.length == 0)
        throw 'No instance data defined';

    // Load list of defined fields
    recursiveHelper(instance.children[0], '', this.fields);

    // Find input bindings
    var bindings = this.head.getElementsByTagName('bind');
    for (var i = 0; i < bindings.length; i++) {

        var path = bindings[i].getAttribute('nodeset');
        if (path != null) {
     
            if (path[0] != '/')
                path = '/' + instance.children[0].nodeName + '/' + path;

            if (this.fields[path] != undefined) {
                var value;
                for (var j = 0; j < bindings[i].attributes.length; j++) {
                    var attr = bindings[i].attributes[j];
                    switch (attr.nodeName) {

                        case 'nodeset':
                        case 'jr:constraintMsg':
                            continue;

                        case 'required':
                        case 'readonly':
                            value = attr.nodeValue == 'true()';
                            break;

                            value = attr
                            break;

                        case 'calculate':
                            value = parseConditions([attr.nodeValue], path);
                            break;

                        case 'constraint':
                        case 'relevant':
                            value = parseConditions(parseAndOr(attr.nodeValue), path);
                            var temp = bindings[i].getAttribute('jr:constraintMsg');
                            if (temp != null)
                                value = {'cond':value, 'msg':temp};
                            break;

                        default:
                            value = attr.nodeValue;
                            break;
                    }

                    this.fields[path][attr.nodeName] = value;
                }
            }
        }
    }

    // Find and load Translations
    var itext = this.head.getElementsByTagName('itext');
    if (itext.length > 0) {

        itext = itext[0];
        var list = itext.getElementsByTagName('translation');
        for (var i = 0; i < list.length; i++) {

            var translation = list[i];
            var lang = translation.getAttribute('lang');
            if (this.translations._default_ == null)
                this.translations._default_ = lang;
            this.translations[lang] = {}
            var def = translation.getAttribute('default');
            if (def != null)
                this.translations._default = lang;
            var texts = translation.getElementsByTagName('text');
            for (var j = 0; j < texts.length; j++) {
                var text = texts[j];
                var id = text.getAttribute('id');
                try {
                    for (var k = 0; k < text.children.length; k++) {

                        var value = text.children[k].firstChild.nodeValue;
                        var form = text.children[k].getAttribute('form') || 'long';
                        this.translations[lang][id + ':' + form] = value;
                    }
                } catch (e) {}
            }
        }
    }
}

/**
 * Private method. Perform basic XForm schema validation before parsing it.
 */
ODKParser.prototype._validateSchema = function(dom) {

    var Namespaces = {
        'xmlns':'http://www.w3.org/2002/xforms',
        'xmlns:h':'http://www.w3.org/1999/xhtml',
        'xmlns:ev':'http://www.w3.org/2001/xml-events',
        'xmlns:xsd':'http://www.w3.org/2001/XMLSchema',
        'xmlns:jr':'http://openrosa.org/javarosa'
    }

    var root = dom.documentElement;

    // Validate root element
    if (root.localName != 'html' || root.prefix == '')
        throw 'Invalid root element - ' + root.localName;

    // Validate Namespace declarations
    if (root.namespaceURI != 'http://www.w3.org/1999/xhtml')
        throw 'Document is not valid XHTML';

    if (root.getAttribute('xmlns') != Namespaces['xmlns'])
        throw 'Invalid XForm document';

    for (var ns in Namespaces)
        if (Namespaces[ns] != root.getAttribute(ns))
            throw 'Invalid or Missing Namespace declaration: "' + ns + '"';

    this.ns = Namespaces['xmlns:h'];

    // Find HEAD and BODY tags
    this.head = dom.getElementsByTagNameNS(this.ns, 'head');
    if (this.head.length == 0)
        throw 'Invalid XForm - no head defined';

    this.body = dom.getElementsByTagNameNS(this.ns, 'body');
    if (this.body.length == 0)
        throw 'Invalid XForm - no body defined';

    // Save inner references for later
    this.head = this.head[0];
    this.body = this.body[0];

    // Load XForm definitions
    this._loadDefinitions();
}


/****************************** BaseControl ******************************/


/**
 * Constructor. Initialize a new BaseControl instance, which defines all common Controls' characteristics.
 * This class should not be directly instantiated!
 *
 * @object translations Reference to the loaded XForm translations.
 */
function BaseControl(translations) {

    this.translations = translations;
    this.label = null;
}

/**
 * Return a parsed text element for the given node.
 *
 * @object node XML node containing the text information to be extracted.
 * @return Either a String or an Object for the node's text, or null if it wasn't possible to extract anything.
 */
BaseControl.prototype.getParsedTextFromNode = function(node) {

    var result = null;
    if (node != null && node.length > 0) {

        node = node[0];
        if (node.firstChild != null)
            result = node.firstChild.nodeValue;

        var ref = node.getAttribute('ref');
        if (ref != null) {

            var results = /itext\(['"](.*?)['"]/.exec(ref);
            if (results != null)
                result = {'text':result, 'itext':results[1], 'itext_form':'long'};
        }

        // Remove node
        node.remove();
    }

    return result;
}

/**
 * Return a translated text value.
 *
 * @object text Text object to be translated.
 * @string lang Translation language to use. Leave undefined to use the default.
 *
 * @return Translated text or an empty string if it wasn't possible to find any.
 */
BaseControl.prototype.getText = function(text, lang) {

    if (text != undefined && text != null) {

        if (typeof text == 'string')
            return text;

        lang = lang || this.translations._default_;
        
        if (this.translations != null && this.translations[lang] != undefined) {

            var key = text['itext'] + ':' + text['itext_form'];
            var value = this.translations[lang][key];
            if (value != undefined)
                return value;
        }
    }

    return '';
}

/**
 * Return a value indicating whether this control is mandatory.
 *
 * @return Boolean value.
 */
BaseControl.prototype.isRequired = function() {

    return this.required;
}

/**
 * Return a translated string for the control's Label.
 *
 * @string lang Translation language to use. Leave undefined to use the default.
 *
 * @return Translated label.
 */
BaseControl.prototype.getLabel = function(lang) {

    return this.getText(this.label, lang);
}

/**
 * Return a translated string for the control's Hint text.
 *
 * @string lang Translation language to use. Leave undefined to use the default.
 *
 * @return Translated hint.
 */
BaseControl.prototype.getHint = function(lang) {

    return this.getText(this.hint, lang);
}

/**
 * Return the control's type. Possible basic values are: input, group, select.
 * Other values may exist.
 *
 * @return Type string.
 */
BaseControl.prototype.getControlType = function() {

    return this.nodeType;
}


/****************************** ControlGroup ******************************/


/**
 * Constructor. Initialize a new ControlGroup instance, which encapsulates a group of controls.
 *
 * @object translations Reference to the loaded XForm translations.
 * @object node XML node describing the current group.
 */
function ControlGroup(translations, node) {

    BaseControl.call(this, translations);
    this.nodeType = 'group';
    this.appearance = node.getAttribute('appearance');
    this.label = this.getParsedTextFromNode(node.getElementsByTagName('label'));
    this.list = []
}
ControlGroup.prototype = new BaseControl();
ControlGroup.prototype.constructor = ControlGroup;


/****************************** Control ******************************/


/**
 * Constructor. Initialize a new generic Control instance, which encapsulates a single control.
 *
 * @object translations Reference to the loaded XForm translations.
 * @object node XML node describing the current group.
 * @string path Path to this control's parent node.
 * @object attributes Reference to the attribute map describing this control.
 */
function Control(translations, node, path, attributes) {

    BaseControl.call(this, translations);
    this.hint = null;
    this.default = null;
    this.ref = path + '/' + node.getAttribute('ref');
    this.nodeType = node.tagName == 'select1' ? 'select' : node.tagName;
    this.label = this.getParsedTextFromNode(node.getElementsByTagName('label'));
    this.hint = this.getParsedTextFromNode(node.getElementsByTagName('hint'));
    this.appearance = node.getAttribute('appearance');

    // Look for corresponding attributes
    var attr = attributes[this.ref];
    if (attr != null) {
        for (var k in attr)
            if (k != 'path')
                this[k] = attr[k];
    }

    // Look for children
    if (node.children.length > 0) {

        this.children = [];
        for (var i = 0; i < node.children.length; i++) {

            var n = node.children[i];
            if (n.nodeName == 'item') {

                var label = this.getParsedTextFromNode(n.getElementsByTagName('label'));
                var value = this.getParsedTextFromNode(n.getElementsByTagName('value'));
                this.children.push({'label':label, 'value':value});
            }
        }
    }
}
Control.prototype = new BaseControl();
Control.prototype.constructor = Control;

/**
 * Return the control's default value or an empty string if no such value was defined.
 *
 * @return Default value string.
 */
Control.prototype.getDefaultValue = function() {

    return this.default != null ? this.default : '';
}

/**
 * Return the control's HTML name.
 *
 * @return HTML name string.
 */
Control.prototype.getElementName = function() {

    return this.ref.replace(/\//g, '_');
}
