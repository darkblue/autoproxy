/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Adblock Plus.
 *
 * The Initial Developer of the Original Code is
 * Wladimir Palant.
 * Portions created by the Initial Developer are Copyright (C) 2006-2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK ***** */

let aup = Components.classes["@mozilla.org/autoproxy;1"].createInstance().wrappedJSObject;

let wnd = null;
let item = null;
let advancedMode = false;

function E(id) {
  return document.getElementById(id);
}

function init() {
  // In K-Meleon we might get the arguments wrapped
  for (var i = 0; i < window.arguments.length; i++)
    if (window.arguments[i] && "wrappedJSObject" in window.arguments[i])
      window.arguments[i] = window.arguments[i].wrappedJSObject;

  [wnd, item] = window.arguments;

  E("filterType").value = (!item.filter || item.filter.disabled || item.filter instanceof aup.WhitelistFilter ? "filterlist" : "whitelist");
  E("customPattern").value = item.location;

  let insertionPoint = E("customPatternBox");
  let addSuggestion = function(address)
  {
    let suggestion = document.createElement("radio");
    suggestion.setAttribute("value", address);
    suggestion.setAttribute("label", address);
    suggestion.setAttribute("crop", "center");
    insertionPoint.parentNode.insertBefore(suggestion, insertionPoint);
  }

  let ioService = Components.classes["@mozilla.org/network/io-service;1"]
                            .getService(Components.interfaces.nsIIOService);
  try
  {
    let suggestions = [""];

    let url = ioService.newURI(item.location, null, null)
                       .QueryInterface(Components.interfaces.nsIURL);
    let suffix = (url.query ? "?*" : "");
    url.query = "";
    suggestions[1] = url.spec + suffix;
    addSuggestion(suggestions[1]);

    let parentURL = ioService.newURI(url.fileName == "" ? ".." : ".", null, url);
    if (!parentURL.equals(url))
    {
      suggestions[2] = parentURL.spec + "*";
      addSuggestion(suggestions[2]);
    }
    else
      suggestions[2] = suggestions[1];

    let rootURL = ioService.newURI("/", null, url);
    if (!rootURL.equals(parentURL) && !rootURL.equals(url))
    {
      suggestions[3] = rootURL.spec + "*";
      addSuggestion(suggestions[3]);
    }
    else
      suggestions[3] = suggestions[2];

    try
    {
      suggestions[4] = url.host.replace(/^www\./, "") + "^";
      addSuggestion(suggestions[4]);
    }
    catch (e)
    {
      suggestions[4] = suggestions[3];
    }

    E("patternGroup").value = (aup.prefs.composer_default in suggestions ? suggestions[aup.prefs.composer_default] : suggestions[1]);
  }
  catch (e)
  {
    // IOService returned nsIURI - not much we can do with it
    addSuggestion(item.location);
    E("patternGroup").value = "";
  }
  if (aup.prefs.composer_default == 0)
    E("customPattern").focus();
  else
    E("patternGroup").focus();

  let types = [];
  for (let type in aup.policy.localizedDescr)
  {
    types.push(parseInt(type));
  }
  types.sort(function(a, b) {
    if (a < b)
      return -1;
    else if (a > b)
      return 1;
    else
      return 0;
  });

  let docDomain = item.docDomain;
  let thirdParty = item.thirdParty;

  if (docDomain)
    docDomain = docDomain.replace(/^www\./i, "").replace(/\.+$/, "");
  if (docDomain)
    E("domainRestriction").value = docDomain;

  E("thirdParty").hidden = !thirdParty;
  E("firstParty").hidden = thirdParty;

  let typeGroup = E("typeGroup");
  for each (let type in types)
  {
    let typeNode = document.createElement("checkbox");
    typeNode.setAttribute("value", aup.policy.typeDescr[type].toLowerCase());
    typeNode.setAttribute("label", aup.policy.localizedDescr[type].toLowerCase());
    typeNode.setAttribute("checked", "true");
    if (item.type == type)
      typeNode.setAttribute("disabled", "true");
    typeNode.addEventListener("command", updateFilter, false);
    typeGroup.appendChild(typeNode);
  }

  updatePatternSelection();

  document.getElementById("disabledWarning").hidden = true;
}

function updateFilter()
{
  let filter = "";

  let type = E("filterType").value
  if (type == "whitelist")
    filter += "@@";

  let pattern = E("patternGroup").value;
  if (pattern == "")
    pattern = E("customPattern").value;

  if (E("anchorStart").checked)
    filter += E("anchorStart").flexibleAnchor ? "||" : "|";

  filter += pattern;

  if (E("anchorEnd").checked)
    filter += "|";

  if (advancedMode)
  {
    let options = [];

    if (E("domainRestrictionEnabled").checked)
    {
      let domainRestriction = E("domainRestriction").value.replace(/[,\s]/g, "").replace(/\.+$/, "");
      if (domainRestriction)
        options.push("domain=" + domainRestriction);
    }

    if (E("firstParty").checked)
      options.push("~third-party");
    if (E("thirdParty").checked)
      options.push("third-party");

    if (E("matchCase").checked)
      options.push("match-case");

    disableElement(false, type == "whitelist", "value", "");

    let enabledTypes = [];
    let disabledTypes = [];
    for (let typeNode = E("typeGroup").firstChild; typeNode; typeNode = typeNode.nextSibling)
    {
      let value = typeNode.getAttribute("value");
      if (value == "document")
        disableElement(typeNode, type != "whitelist", "checked", false);

      if (value != "document" || !typeNode.disabled)
      {
        if (typeNode.checked)
          enabledTypes.push(value);
        else
          disabledTypes.push("~" + value);
      }
    }
    if (disabledTypes.length < enabledTypes.length)
      options.push.apply(options, disabledTypes);
    else
      options.push.apply(options, enabledTypes);

    if (options.length)
      filter += "$" + options.join(",");
  }

  filter = aup.normalizeFilter(filter);
  E("regexpWarning").hidden = !aup.Filter.regexpRegExp.test(filter);

  let hasShortcut = true;
  if (E("regexpWarning").hidden)
  {
    let compiledFilter = aup.Filter.fromText(filter);

    let matcher = null;
    if (compiledFilter instanceof aup.BlockingFilter)
      matcher = aup.blacklistMatcher;
    if (compiledFilter instanceof aup.WhitelistFilter)
      matcher = aup.whitelistMatcher;
    if (matcher && !matcher.findShortcut(compiledFilter.text))
      hasShortcut = false;
  }
  E("shortpatternWarning").hidden = hasShortcut;

  E("filter").value = filter;
}

function updatePatternSelection()
{
  let pattern = E("patternGroup").value;
  if (pattern == "")
  {
    pattern = E("customPattern").value;
  }
  else
  {
    E("anchorStart").checked = true;
    E("anchorEnd").checked = false;
  }

  function testFilter(/**String*/ filter) /**Boolean*/
  {
    return aup.RegExpFilter.fromText(filter).matches(item.location, item.typeDescr, item.docDomain, item.thirdParty);
  }

  let anchorStartCheckbox = E("anchorStart");
  if (!/^\*/.test(pattern) && testFilter("||" + pattern))
  {
    disableElement(anchorStartCheckbox, false, "checked", false);
    anchorStartCheckbox.setAttribute("label", anchorStartCheckbox.getAttribute("labelFlexible"));
    anchorStartCheckbox.accessKey =  anchorStartCheckbox.getAttribute("accesskeyFlexible");
    anchorStartCheckbox.flexibleAnchor = true;
  }
  else
  {
    disableElement(anchorStartCheckbox, /^\*/.test(pattern) || !testFilter("|" + pattern), "checked", false);
    anchorStartCheckbox.setAttribute("label", anchorStartCheckbox.getAttribute("labelRegular"));
    anchorStartCheckbox.accessKey = anchorStartCheckbox.getAttribute("accesskeyRegular");
    anchorStartCheckbox.flexibleAnchor = false;
  }
  disableElement(E("anchorEnd"), /[\*\^]$/.test(pattern) || !testFilter(pattern + "|"), "checked", false);

  updateFilter();
  setAdvancedMode(document.documentElement.getAttribute("advancedMode") == "true");
}

function updateCustomPattern()
{
  E("patternGroup").value = "";
  updatePatternSelection();
}

function addFilter() {
  let filter = aup.Filter.fromText(document.getElementById("filter").value);

  if (filter.disabled)
  {
    filter.disabled = false;
    aup.filterStorage.triggerFilterObservers("enable", [filter]);
  }

  aup.filterStorage.addFilter(filter);
  aup.filterStorage.saveToDisk();

  if (wnd && !wnd.closed)
    aup.policy.refilterWindow(wnd);

  return true;
}

function setAdvancedMode(mode) {
  advancedMode = mode;

  var dialog = document.documentElement;
  dialog.setAttribute("advancedMode", advancedMode);

  var button = dialog.getButton("disclosure");
  button.setAttribute("label", dialog.getAttribute(advancedMode ? "buttonlabeldisclosure_off" : "buttonlabeldisclosure_on"));

  updateFilter();
}

function disableElement(element, disable, valueProperty, disabledValue) {
  if (element.disabled == disable)
    return;

  element.disabled = disable;
  if (disable)
  {
    element._aupStoredValue = element[valueProperty];
    element[valueProperty] = disabledValue;
  }
  else
  {
    if ("_aupStoredValue" in element)
      element[valueProperty] = element._aupStoredValue;
    delete element._aupStoredValue;
  }
}

function openPreferences() {
  aup.openSettingsDialog(item.location, E("filter").value);
}

function doEnable() {
/*
  aup.prefs.enabled = true;
  aup.prefs.save();
  E("disabledWarning").hidden = true;
*/
}

/**
 * Selects or unselects all type checkboxes except those
 * that are disabled.
 */
function selectAllTypes(/**Boolean*/ select)
{
  for (let typeNode = E("typeGroup").firstChild; typeNode; typeNode = typeNode.nextSibling)
    if (typeNode.getAttribute("disabled") != "true")
      typeNode.checked = select;
  updateFilter();
}
