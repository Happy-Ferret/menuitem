/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
'use strict';

const windowUtils = require("sdk/deprecated/window-utils");
const { Class } = require("sdk/core/heritage");
const { validateOptions } = require("sdk/deprecated/api-utils");
const { on, emit, once, off } = require("sdk/event/core");
const { isBrowser } = require("sdk/window/utils");
const { EventTarget } = require('sdk/event/target');
const menuitemNS = require("sdk/core/namespace").ns();

const { unload } = require('pathfinder/lib/addon/unload');

const NS_XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

function MenuitemOptions(options) {
  return validateOptions(options, {
    id: { is: ['string'] },
    menuid: { is: ['undefined', 'string'] },
    insertbefore: { is: ['undefined', 'string', 'object', 'number'] },
	insertafter: { is: ['undefined', 'string', 'object', 'number'] },
    separatorbefore: { is: ['undefined', 'boolean', 'string', 'object'] },
    separatorafter: { is: ['undefined', 'boolean', 'string', 'object'] },
    label: { is: ["string"] },
    include: { is: ['string', 'undefined'] },
    image: { is: ['string', 'undefined'] },
    disabled: { is: ["undefined", "boolean"], map: function(v) !!v},
    accesskey: { is: ["undefined", "string"] },
    key: { is: ["undefined", "string"] },
    checked: { is: ['undefined', 'boolean'] },
    className: { is: ["undefined", "string"] },
    onCommand: { is: ['undefined', 'function'] },
    useChrome: { map: function(v) !!v }
  });
}

let Menuitem = Class({
  extends: EventTarget,
  initialize: function(options) {
    options = menuitemNS(this).options = MenuitemOptions(options);
    EventTarget.prototype.initialize.call(this, options);

    menuitemNS(this).destroyed = false;
    menuitemNS(this).unloaders = [];
    menuitemNS(this).menuitems = addMenuitems(this, options).menuitems;
  },
  get id() menuitemNS(this).options.id,
  get label() menuitemNS(this).options.label,
  set label(val) updateProperty(this, 'label', val),
  get image() menuitemNS(this).options.image,
  set image(val) updateProperty(this, 'image', val),
  get checked() menuitemNS(this).options.checked,
  set checked(val) updateProperty(this, 'checked', !!val),
  get disabled() menuitemNS(this).options.disabled,
  set disabled(val) updateProperty(this, 'disabled', !!val),
  get key() menuitemNS(this).options.key,
  set key(val) updateProperty(this, 'key', val),
  clone: function (overwrites) {
    let opts = Object.clone(menuitemNS(this).options);
    for (let key in overwrites) {
      opts[key] = overwrites[key];
    }
    return Menuitem(opts);
  },
  get menuid() menuitemNS(this).options.menuid,
  set menuid(val) {
    let options = menuitemNS(this).options;
    options.menuid = val;

    forEachMI(function(menuitem, i, $) {
      updateMenuitemParent(menuitem, options, $);
    });
  },
  destroy: function() {
    if (!menuitemNS(this).destroyed) {
      menuitemNS(this).destroyed = true;
      menuitemNS(this).unloaders.forEach(function(u) u());
      menuitemNS(this).unloaders = null;
      menuitemNS(this).menuitems = null;
    }
    return true;
  }
});

function addMenuitems(self, options) {
  let menuitems = [];

  // setup window tracker
  windowUtils.WindowTracker({
    onTrack: function (window) {
      if (menuitemNS(self).destroyed) return;
      if (options.include) {
        if (options.include != window.location) return;
      }
      else if (!isBrowser(window)) {
        return;
      }

      // add the new menuitem to a menu
      var menuitem = updateMenuitemAttributes(
          window.document.createElementNS(NS_XUL, "menuitem"), options);
      var menuitems_i = menuitems.push(menuitem) - 1;

      var sepBefore, sepAfter;
      if (options.separatorbefore)
        sepBefore = createSeparator(options.separatorbefore, window);
      if (options.separatorafter)
        sepAfter = createSeparator(options.separatorafter, window);

      var insertF = item => updateMenuitemParent(item, options, function(id) window.document.getElementById(id));

      insertF(menuitem);
      sepBefore && menuitem.parentNode.insertBefore(sepBefore, menuitem);
      sepAfter && menuitem.parentNode.insertBefore(sepAfter, menuitem.nextSibling);

      menuitem.addEventListener("command", function() {
        if (!self.disabled)
          emit(self, 'command', options.useChrome ? window : null);
      }, true);

      // add unloader
      let unloader = function unloader() {
        let parent = menuitem.parentNode;
        if (parent) {
          parent.removeChild(menuitem);
          sepBefore && parent.removeChild(sepBefore);
          sepAfter && parent.removeChild(sepAfter);
        }
        menuitems[menuitems_i] = null;
      };

      menuitemNS(self).unloaders.push(function() {
        remover();
        unloader();
      });

      let remover = unload(unloader, window);
    }

  });

  return { menuitems: menuitems };
}

/**
 *  add the menutiem to the ui
 * @param menuitem
 * @param options
 * @param $
 * @returns {*}
 */
function updateMenuitemParent(menuitem, options, $)
{
	// add the menutiem to the ui
	if (!options.menuid)
	{
		return false;
	}

	let ids = Array.isArray(options.menuid) ? options.menuid : [options.menuid];
	let menuid = null;

	for (var len = ids.length, i = 0; i < len; i++)
	{
		if ($(ids[i]))
		{
			menuid = $(ids[i]);
		}
		else
		{
			continue;
		}

		if (options.insertafter !== void(0) && tryParent(menuid, menuitem, options.insertafter, true))
		{
			return true;
		}
		if (options.insertbefore !== void(0) && tryParent(menuid, menuitem, options.insertbefore, false))
		{
			return true;
		}
	}

	if (menuid)
	{
		return tryParent(menuid, menuitem);
	}

	return false;
}

function updateMenuitemAttributes(menuitem, options) {
  menuitem.setAttribute("id", options.id);
  menuitem.setAttribute("label", options.label);

  if (options.accesskey)
    menuitem.setAttribute("accesskey", options.accesskey);

  if (options.key)
    menuitem.setAttribute("key", options.key);

  menuitem.setAttribute("disabled", !!options.disabled);

  if (options.image) {
    menuitem.classList.add("menuitem-iconic");
    menuitem.style.listStyleImage = "url('" + options.image + "')";
  }

  if (options.checked)
    menuitem.setAttribute('checked', options.checked);

  if (options.className)
    options.className.split(/\s+/).forEach(function(name) menuitem.classList.add(name));

  return menuitem;
}

function updateProperty(menuitem, key, val) {
  menuitemNS(menuitem).options[key] = val;

  forEachMI(function(menuitem) {
    menuitem.setAttribute(key, val);
  }, menuitem);
  return val;
}

function forEachMI(callback, menuitem) {
  menuitemNS(menuitem).menuitems.forEach(function(mi, i) {
    if (!mi) return;
    callback(mi, i, function(id) mi.ownerDocument.getElementById(id));
  });
}

/**
 *
 * @param parent
 * @param menuitem
 * @param before
 * @param insertafter
 * @returns {boolean}
 */
function tryParent(parent, menuitem, before, insertafter)
{
	if (parent)
	{
		if (before)
		{
			var node = null;

			if (insertafter)
			{
				if (node = insertBefore(parent, before))
				{
					node = node.nextSibling;
				}
			}
			else
			{
				node = insertBefore(parent, before);
			}

			if (node)
			{
				parent.insertBefore(menuitem, node);
				return true;
			}
			else if (insertafter === false || insertafter === true)
			{
				return false;
			}
		}

		parent.appendChild(menuitem);
		return true;
	}

	return false;
}

function insertBefore(parent, insertBefore) {
  if (typeof insertBefore == "number") {
    switch (insertBefore) {
      case MenuitemExport.FIRST_CHILD:
        return parent.firstChild;
    }
    return null;
  }
  else if (typeof insertBefore == "string") {
    return parent.querySelector("#" + insertBefore);
  }
  return insertBefore;
}

/**
 *
 * @param data - ['undefined', 'boolean', 'string', 'object']
 * @param window
 * @returns {*}
 */
function createSeparator(data, window)
{
	let elem;
	if (typeof data === 'object')
	{
		elem = data;
	}
	else
	{
		elem = window.document.createElementNS(NS_XUL, "menuseparator");
	}

	if (typeof data === 'string')
	{
		elem.id = data;
	}

	return elem;
}

function MenuitemExport(options) {
  return Menuitem(options);
}
MenuitemExport.FIRST_CHILD = 1;

exports.Menuitem = MenuitemExport;
exports.createSeparator = createSeparator;
