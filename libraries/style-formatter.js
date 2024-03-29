if (typeof module !== 'undefined') {
  if (typeof DOMParser === 'undefined') var DOMParser = require('@xmldom/xmldom').DOMParser
  if (typeof XMLSerializer === 'undefined') var XMLSerializer = require('@xmldom/xmldom').XMLSerializer
  if (typeof vkbeautify === 'undefined') var vkbeautify = require('./vkbeautify')
}

var formatStyle = function (inputString) {
    
    var parseXML = function (xmlStr) {
        var xmlDoc;
        var parser = new DOMParser();
        xmlDoc = parser.parseFromString(xmlStr,"text/xml");
        
        if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
          throw "invalidXML";
        }
        return xmlDoc;
    };
    
    // Determine sort position of provided node
    var getIndex = function (node) {
        // Desired element order. XML comments at the top stay at the top.
        // The last XML comment stays at the end, and all other XML comments
        // stay with their preceding element.
        desiredNodeOrder = ["preceding-comment", "title", "title-short", "id",
        "link[@rel='self']", "link[@rel='independent-parent']", "link[@rel='template']",
        "link[@rel='documentation']", "author", "contributor",
        "category[@citation-format]", "category[@field]", "issn",
        "eissn", "issnl", "summary", "published", "updated", "rights",
        "end-comment"];
        
        function getKey (node) {
            var key;
            switch (node.tagName) {
                case "link":
                    if (node.hasAttribute("rel")) {
                        key = node.tagName + "[@rel='" + node.getAttribute("rel") + "']";
                    }
                    break;
                case "category":
                    if (node.hasAttribute("citation-format")) {
                        key = node.tagName + "[@" + "citation-format" + "]";
                    } else if (node.hasAttribute("field")) {
                        key = node.tagName + "[@" + "field" + "]";
                    }
                    break;
                default:
                    key = node.tagName;
                    break;
            }
            return key;
        }
        
        var nodeKey;
        
        // Special treatment of XML comments (nodeType 8)
        if (node.nodeType == 8) {
            var hasPrecedingElement = false;
            var hasFollowingElement = false;
            var searchNode = node;
            var precedingElement;
            while( hasPrecedingElement === false && (searchNode = searchNode.previousSibling) !== null ) {
                if (searchNode.nodeType == 1) {
                    hasPrecedingElement = true;
                    precedingElement = searchNode;
                }
            }
            
            searchNode = node;
            while( hasFollowingElement === false && (searchNode = searchNode.nextSibling) !== null ) {
                if (searchNode.nodeType == 1 || searchNode.nodeType == 8) {
                    hasFollowingElement = true;
                }
            }
            
            if (hasPrecedingElement === false) {
                nodeKey = "preceding-comment";
            } else if (hasFollowingElement === false) {
                nodeKey = "end-comment";
            } else {
                nodeKey = getKey(precedingElement);
            }
        } else {
            nodeKey = getKey(node);
        }
        
        return desiredNodeOrder.indexOf(nodeKey);
    };

    var XmlObject = parseXML(inputString);
    
    // Reorder attributes on cs:style
    // Place "xmlns" first, "version" second, "default-locale" (optional) last, leave other attributes at former position
    var styleRoot = XmlObject.getElementsByTagNameNS("http://purl.org/net/xbiblio/csl","style")[0];
    if (styleRoot.hasAttribute("xmlns")) {
        var xmlnsValue = styleRoot.getAttribute("xmlns");
        styleRoot.removeAttribute("xmlns"); 
        styleRoot.setAttribute("xmlns", xmlnsValue);
    }
    var styleRootAttributesCount = styleRoot.attributes.length;
    for (var j = 0; j < styleRootAttributesCount; j++) {
        var attribute = styleRoot.attributes[j];
        if (attribute.name != "xmlns") {
          var attributeValue = attribute.value;
          styleRoot.removeAttribute(attribute.name); 
          styleRoot.setAttribute(attribute.name, attributeValue);
          
          // Since we're moving the attribute (within the NamedNodeMap collection), adjust counter and max index since next attribute will move down
          j = j - 1;
          styleRootAttributesCount = styleRootAttributesCount - 1;
        }
    }
    if (styleRoot.hasAttribute("default-locale")) {
        var locale = styleRoot.getAttribute("default-locale");
        styleRoot.removeAttribute("default-locale"); 
        styleRoot.setAttribute("default-locale", locale);
    }

    // Trim whitespace from cs:title textContent
    var styleTitle = XmlObject.getElementsByTagNameNS("http://purl.org/net/xbiblio/csl","title")[0];
    if (styleTitle) {
        styleTitle.textContent = styleTitle.textContent.trim();
    }

    // Trim whitespace from cs:summary textContent
    var styleSummary = XmlObject.getElementsByTagNameNS("http://purl.org/net/xbiblio/csl","summary")[0];
    if (styleSummary) {
        styleSummary.textContent = styleSummary.textContent.trim();
    }

    // Reorder attributes on cs:link
    var styleLinks = XmlObject.getElementsByTagNameNS("http://purl.org/net/xbiblio/csl","link");
    for (var i = 0; i < styleLinks.length; i++) {
        if (styleLinks[i].hasAttribute("rel")) {
            var relValue = styleLinks[i].getAttribute("rel");
            styleLinks[i].removeAttribute("rel"); 
            styleLinks[i].setAttribute("rel", relValue);
        }
    }

   // Reorder child elements in cs:info
    var infoNode = XmlObject.getElementsByTagNameNS("http://purl.org/net/xbiblio/csl","info")[0];
    if (infoNode) {
        var infoChildNodes = infoNode.childNodes;
        
        var sortedNodes = [];
        for (i = 0; i < infoChildNodes.length; ++i) {
            // Skip Text nodes (see http://stackoverflow.com/questions/12009329/why-does-this-childnodes-give-me-that-strange-output )
            // nodeType 1 are Elements, nodeType 8 are XML comments
            if (infoChildNodes[i].nodeType == 1 || infoChildNodes[i].nodeType == 8) {
                sortedNodes.push([infoChildNodes[i], getIndex(infoChildNodes[i]), i]);
            }
        }

        sortedNodes.sort(function(a,b) {
            // First sort on desired element order
            var sortComparison = (a[1] == b[1] ? 0 : (a[1] > b[1] ? 1 : -1));

            // Secondary sort on original node position
            if (sortComparison === 0) {
                sortComparison = (a[2] == b[2] ? 0 : (a[2] > b[2] ? 1 : -1));
            }
            return sortComparison;
        });

        for (i = 0; i < sortedNodes.length; ++i) {
            infoNode.appendChild(sortedNodes[i][0]);
        }
    }

    // Convert XML object to string
    var serializer = new XMLSerializer(); 
    var outputString = serializer.serializeToString(XmlObject);            

    // Pretty print
    outputString = vkbeautify.xml(outputString, 2);

    // Escape hard-to-identify characters
    outputString = outputString.replace(/\u00a0/g,"&#160;"); //no-break space
    outputString = outputString.replace(/ᵉ/g,"&#7497;"); //modifier letter small e
    outputString = outputString.replace(/\u2003/g, "&#8195;"); // em space
    outputString = outputString.replace(/‑/g,"&#8209;"); //non-breaking hyphen
    outputString = outputString.replace(/–/g,"&#8211;"); //en dash
    outputString = outputString.replace(/—/g,"&#8212;"); //em dash
    outputString = outputString.replace(/\u202F/g,"&#8239;"); //narrow no-break space

    // Make sure XML declaration is present and that "utf-8" is lowercased
    var xmlDeclarationRegEx = /<\?xml.+\?>/;
    var xmlDeclaration = '<?xml version="1.0" encoding="utf-8"?>';
    if (xmlDeclarationRegEx.test(outputString)) {
      // Replace XML declaration if present
      outputString = outputString.replace(xmlDeclarationRegEx, xmlDeclaration);
    } else {
      // Add XML declaration if absent
      outputString = xmlDeclaration + "\n" + outputString;
    }

    // Add trailing return to match repository convention
    outputString = outputString + "\n";

    return outputString;
};

if (typeof module !== 'undefined') module.exports = formatStyle;
