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


/****************************** HTMLRenderer ******************************/

/**
 * Singleton renderer instance for rendering a XForm as HTML.
 */
var HTMLRenderer = new function() {

    // Instantiate HTML elements factory
    this.factory = new HTMLFormElementFactory();

    /**
     * Return the HTML factory instance.
     */
    this.getFactory = function() {

        return this.factory;
    }

    /**
     * Set the HTML factory instance to use.
     *
     * @object factory Factory instance.
     * @return Nothing.
     */
    this.setFactory = function(factory) {

        this.factory = factory;
    }
}



/****************************** HTMLFormElementFactory ******************************/


/**
 * Constructor. Instantiate a new HTMLFormElementFactory for constructing HTML elements out of controls.
 */
function HTMLFormElementFactory() {

    this.parser = null;
}

/**
 * Set the ODKParser reference used by the built elements.
 *
 * @object parser ODKParser object reference.
 * @return Nothing.
 */
HTMLFormElementFactory.prototype.setParser = function(parser) {

    this.parser = parser;
}

/**
 * Construct a HTML element out of the given control.
 *
 * @object control Parsed control instance.
 * @return HTML element or null if no element could be instantiated.
 */
HTMLFormElementFactory.prototype.GetElementFromControl = function(control) {

    var elem = null;
    switch (control.getControlType()) {

        case 'group':
            elem = new GroupFormElement(this.parser, control);
            break;

        case 'input':
            elem = new InputFormElement(this.parser, control);
            break;

        case 'select':
            elem = new SelectFormElement(this.parser, control);
            break;

        case 'upload':

        default:
            elem = new GenericFormElement(this.parser);
            break;
    }

    return elem;
}


/****************************** GenericFormElement ******************************/

/**
 * Constructor. Define a generic HTML element. This is used a base class for all other elements.
 */
function GenericFormElement(parser) {

    this.parser = parser;
}

/**
 * Define a global ID sequence.
 */
GenericFormElement.Sequence = 0;

/**
 *
 *
 */
GenericFormElement.prototype.getAsHTML = function() {

    return "<div><!-- generic --></div>";
}

GenericFormElement.prototype.getUniqueId = function() {

    GenericFormElement.Sequence++;
    return "_id_" + GenericFormElement.Sequence.toString();
}

GenericFormElement.prototype.isVisible = function() {

    if (this.control == undefined || this.control.revelant == undefined || this.parser == null)
        return true;

    var dep_control = this.parser.findControl(this.control.relevant.path);
    if (dep_control == null)
        return true;

    // TODO: verify condition on dependency control
}


/****************************** InputFormElement ******************************/


function InputFormElement(parser, control) {

    GenericFormElement.call(this, parser);
    this.control = control;
}
InputFormElement.prototype = new GenericFormElement();
InputFormElement.prototype.constructor = InputFormElement;


InputFormElement.prototype.getAsHTML = function(lang) {

    var id = this.getUniqueId();
    var required = this.control.isRequired() ? ' *' : '';

    html = "<div>";
    html += "<label for=\"" + id + "\">" + this.control.getLabel(lang) + required + "</label>";
    html += "<input id=\"" + id + "\" type=\"text\" name=\"" + this.control.getElementName() + "\" value=\"" + this.control.getDefaultValue() + "\" />";
    var hint = this.control.getHint(lang);
    if (hint != '')
        html += "<span class=\"hint\">" + hint + "</span>";
    html += "</div>";

    return html;
}


/****************************** SelectFormElement ******************************/


function SelectFormElement(parser, control) {

    GenericFormElement.call(this, parser);
    this.control = control;
}
SelectFormElement.prototype = new GenericFormElement();
SelectFormElement.prototype.constructor = SelectFormElement;


SelectFormElement.prototype.getAsHTML = function(lang) {

    var id = this.getUniqueId();
    var def = this.control.getDefaultValue();
    var required = this.control.isRequired() ? ' *' : '';

    html = "<div>";
    html += "<label for=\"" + id + "\">" + this.control.getLabel(lang) + required + "</label>";
    html += "<select" + (this.control.type == 'select1' ? ' size="1"' : '') + " id=\"" + id + "\" name=\"" + this.control.getElementName() + "\">";
    for (var i = 0; i < this.control.children.length; i++) {

        var item = this.control.children[i];
        html += "<option value=\"" + item.value + "\"";
        if (def == item['value'])
            html += ' selected="selected"';
        html += ">" + this.control.getText(item.label, lang) + "</option>";
    }
    html += "</select>";
    var hint = this.control.getHint(lang);
    if (hint != '')
        html += "<span class=\"hint\">" + hint + "</span>";
    html += "</div>";

    return html;
}


/****************************** GroupFormElement ******************************/


function GroupFormElement(parser, control) {

    GenericFormElement.call(this, parser);
    this.control = control;
    this.questions = [];
    for (var i = 0; i < control.list.length; i++) {

        var elem = this.parser.factory.GetElementFromControl(control.list[i]);
        if (elem != null)
            this.questions.push(elem);
    }
}
GroupFormElement.prototype = new GenericFormElement();
GroupFormElement.prototype.constructor = GroupFormElement;


GroupFormElement.prototype.getAsHTML = function(lang) {

    var id = this.getUniqueId();

    html = "<fieldset id=\"" + id + "\">";
    html += "<legend>" + this.control.getLabel(lang) + "</legend>";
    for (var i = 0; i < this.questions.length; i++)
        html += this.questions[i].getAsHTML(lang);
    if (this.control.repeat)
        html += "<button type=\"button\">Add More</button>";
    html += "</fieldset>";

    return html;
}
