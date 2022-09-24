"use strict";

// Spacebar on the 4th row
const DEFAULT_LAYOUT = ["qwertyuiop", "asdfghjkl", "zxcvbnm", ""];
const NUM_ROWS = DEFAULT_LAYOUT.length;

// px
const DESKTOP_WIDTH = 500;

// Relative widths of different key types
const KEY_WIDTH = 50; // "Standard" letter key
const BACKSPACE_WIDTH = 100;
const ENTER_WIDTH = 100;
const SPACEBAR_WIDTH = 200;

const ROW_OFFSETS = {
  [0]: 0,
  [1]: 0.5,
  [2]: 1.5,
};

// let screenWidth; // Updated by media query at bottom of this file

/** @type {Element} */
let textBoxEl;

/**
 * Global keyboard instance
 * @type {Keyboard} */
let keyboard;

/** @typedef {{element: Element, x: number, y: number, width: number, height: number}} FlexItemInfo */

class Keyboard {
  /**
   * Creates a new keyboard filled with keys with a default QWERTY layout
   * @param {Element} keyboardEl
   */
  constructor(keyboardEl) {
    this.keyboardEl = keyboardEl;
    this.keyPressPreview = new KeyPressPreview();

    /** @type {KeyboardRow[]} */
    this.keyRows = DEFAULT_LAYOUT.map((rowStr) => {
      const rowEl = document.createElement("span");
      rowEl.className = "keyboard-row";

      const rowWrapper = document.createElement("div");
      rowWrapper.className = "row-wrapper";

      rowWrapper.append(rowEl);
      keyboardEl.append(rowWrapper);
      const keys = rowStr
        .split("")
        .map(
          (char) =>
            new Key({ displayStr: char, keyboard: this, parentEl: rowEl })
        );

      return new KeyboardRow(rowEl, keys);
    });

    this.keyRows[0].addDefaultKey(
      new Key({
        displayStr: "←",
        keyboard: this,
        parentEl: this.keyRows[0].rowEl,
        width: BACKSPACE_WIDTH,
        onPress: Keyboard.backspace,
      })
    );
    this.keyRows[1].addDefaultKey(
      new Key({
        displayStr: "↵",
        keyboard: this,
        parentEl: this.keyRows[1].rowEl,
        width: ENTER_WIDTH,
        onPress: Keyboard.enter,
      })
    );

    this.keyRows[3].addDefaultKey(
      new Key({
        displayStr: "―",
        keyboard: this,
        parentEl: this.keyRows[3].rowEl,
        width: SPACEBAR_WIDTH,
        onPress: Keyboard.spacebar,
      })
    );

    const createSpaceEls = (rowNum, parent) => {
      const el1 = document.createElement("span");
      const el2 = document.createElement("span");
      el1.style.flexBasis = el2.style.flexBasis =
        ROW_OFFSETS[rowNum] * KEY_WIDTH + "px";
      el1.style.display = el2.style.display = "inline-block";
      parent.before(el1);
      parent.after(el2);
    };

    // Invisible layout divs
    for (let row = 0; row < this.keyRows.length; row++) {
      const keyRow = this.keyRows[row];
      createSpaceEls(row, keyRow.rowEl);
    }

    this.keyPressPreview.registerTouchEvents(
      this.keyRows.flatMap((row) => row.keys.map((key) => key.keyEl))
    );
  }

  // Special keypresses
  static backspace() {
    textBoxEl.value = textBoxEl.value.slice(0, -1);
  }
  static enter() {
    textBoxEl.value += "\n";
  }
  static spacebar() {
    textBoxEl.value += " ";
  }

  /**
   * Get the key at the specified row and col. Returns null if out of bounds
   * @param {number} row
   * @param {number} col
   * @returns {Key?}
   */
  getKey(row, col) {
    if (
      row < 0 ||
      row >= this.keyRows.length ||
      col < 0 ||
      col >= this.keyRows[row].length
    )
      return null;
    const keyRow = this.keyRows[row];
    return keyRow.keys[col];
  }

  /**
   *
   * @param {Key} key
   * @returns {{row: number, col: number}}
   */
  getKeyPos(key) {
    // TODO: optimize?
    for (let row = 0; row < this.keyRows.length; row++) {
      const foundKeyIndex = this.keyRows[row].keys.findIndex((k) => k === key);
      if (foundKeyIndex !== -1) return { row, col: foundKeyIndex };
    }

    console.error("Couldn't find key in keyboard", { key, keyboard: this });
  }

  /**
   * Move a Key from one place to another. Handles changing position in both DOM
   * and the Keyboard
   * @param {Key} key
   * @param {number} fromRow
   * @param {number} fromCol
   * @param {number} toRow
   * @param {number} toCol
   */
  moveKey(key, fromRow, fromCol, toRow, toCol) {
    // console.log("Moved " + key.displayStr, { fromRow, fromCol, toRow, toCol });
    console.assert(
      this.keyRows[fromRow].rowEl.children.item(fromCol) === key.keyEl,
      this.keyRows[fromRow].rowEl.children.item(fromCol),
      key.keyEl
    );

    // Remove from DOM and keyRow
    this.keyRows[fromRow].rowEl.removeChild(key.keyEl);
    this.keyRows[fromRow].keys.splice(fromCol, 1);

    //Add it at the new position in DOM and keyRow
    const newRowEl = this.keyRows[toRow].rowEl;
    newRowEl.insertBefore(key.keyEl, newRowEl.children.item(toCol));
    this.keyRows[toRow].keys.splice(toCol, 0, key);
  }

  /**
   * Sorts the pressed key into the top left and shuffles the last keys in each
   * row to fit the (approximate) shape of the default keyboard
   * @param {Key} pressedKey
   */
  sortKeys(pressedKey) {
    const { row: oldRow, col: oldCol } = this.getKeyPos(pressedKey);

    const oldFlexItemsInfo = this.getFlexItemsInfo();
    // Remove the pressed key and add it back at 0,0
    this.moveKey(pressedKey, oldRow, oldCol, 0, 0);

    // For each row starting from the top, check if it's wider than it should
    // be. If it is, shuffle the last keys down until it's a good width, then
    // move on to the next row.
    for (let i = 0; i < this.keyRows.length - 1; i++) {
      const keyRow = this.keyRows[i];
      const keysArr = keyRow.keys;

      while (keyRow.rowWidth() > keyRow.defaultRowWidth) {
        let lastKey = keysArr[keysArr.length - 1];
        this.moveKey(lastKey, i, keysArr.length - 1, i + 1, 0);
      }
    }

    // Animate them!
    const newFlexItemsInfo = this.getFlexItemsInfo();
    this.animateFlexItems(oldFlexItemsInfo, newFlexItemsInfo);
  }

  /**
   * Gets info about an element's position, needed for animating flex elements.
   * Thanks https://stackoverflow.com/a/53618561
   * @returns {Array<FlexItemInfo>}
   */
  getFlexItemsInfo() {
    return Array.from(this.keyboardEl.querySelectorAll(".key")).map((item) => {
      const rect = item.getBoundingClientRect();
      return {
        element: item,
        x: rect.left,
        y: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
      };
    });
  }

  /**
   * @param {FlexItemInfo[]} oldFlexItemsInfo
   * @param {FlexItemInfo[]} newFlexItemsInfo
   */
  animateFlexItems(oldFlexItemsInfo, newFlexItemsInfo) {
    for (const newFlexItemInfo of newFlexItemsInfo) {
      const oldFlexItemInfo = oldFlexItemsInfo.find(
        (itemInfo) => itemInfo.element === newFlexItemInfo.element
      );

      const translateX = oldFlexItemInfo.x - newFlexItemInfo.x;
      const translateY = oldFlexItemInfo.y - newFlexItemInfo.y;
      const scaleX = oldFlexItemInfo.width / newFlexItemInfo.width;
      const scaleY = oldFlexItemInfo.height / newFlexItemInfo.height;

      newFlexItemInfo.element.animate(
        [
          {
            transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
          },
          { transform: "none" },
        ],
        {
          duration: 150,
          easing: "ease-out",
        }
      );
    }
  }
}

class KeyboardRow {
  /**
   *
   * @param {Element} rowEl
   * @param {Key[]} keys
   */
  constructor(rowEl, keys) {
    this.rowEl = rowEl;
    this.keys = keys;
    /** @type {number} The default total width of keys in this row */
    this.defaultRowWidth = this.rowWidth();
  }

  /**
   * Use to add another key to this row as if it was added in the constructor;
   * without doing this, the defaultRowWidth is not properly calculated.
   * @param {Key} key
   */
  addDefaultKey(key) {
    this.keys.push(key);
    this.defaultRowWidth = this.rowWidth();
  }

  /**
   * @returns {number} The current total width of keys in this row
   */
  rowWidth() {
    return this.keys.reduce((prev, cur) => prev + cur.width, 0);
  }
}

class Key {
  /**
   * Creates a new key on the keyboard, including adding it to the DOM by appending it to parentEl
   * @param {Object} obj
   * @param {string} obj.displayStr String (char) to display on this key
   * @param {Keyboard} obj.keyboard Containing keyboard
   * @param {Element} obj.parentEl Containing DOM element (row)
   * @param {number?} obj.width Optional width; if not passed, the key will use a default width
   * @param {Function?} obj.onPress Optional function; if not passed, the key will write its displayStr on press
   */
  constructor({ displayStr, keyboard, parentEl, width, onPress }) {
    this.displayStr = displayStr;
    this.width = width || KEY_WIDTH;
    this.keyboard = keyboard;
    this.onPress = () => {
      // Type the key
      (onPress || (() => (textBoxEl.value += displayStr)))();

      // Re-sort it to the top-left
      keyboard.sortKeys(this);
    };

    const keyEl = document.createElement("div");
    keyEl.className = "key";
    keyEl.innerText = displayStr;
    keyEl.style.flexBasis = this.width + "px";
    keyEl.addEventListener("pointerup", this.onPress);

    parentEl.appendChild(keyEl);
    this.keyEl = keyEl;
  }
}

class KeyPressPreview {
  shown = false;
  hoveredEl = null;
  previewEl = null;

  static Y_OFF = -70; // px

  constructor() {
    const previewEl = document.createElement("div");
    previewEl.style.top = "-200px"; // Off the screen
    previewEl.className = "preview";
    document.body.append(previewEl);

    // When the pointer is released, hide the preview
    document.addEventListener("pointerup", (e) => {
      this.hide();
    });

    this.previewEl = previewEl;
  }

  /**
   * Register events to detect touched key for setting its pressed style and
   * showing the key preview
   * @param {Element[]} keyEls
   */
  registerTouchEvents(keyEls) {
    ///////// MOUSE-ONLY EVENTS

    // When the pointer moves over a key, make it "pressed" and show its preview
    keyEls.forEach((keyEl) => {
      keyEl.onpointerdown = keyEl.onpointerover = (e) => {
        const pressed = e.buttons !== 0;
        if (pressed) {
          keyEl.classList.add("pressed");
          // TODO: show preview on desktop?
          this.show(keyEl);
        }
      };

      // When the pointer leaves, make it not pressed (but don't hide the preview
      // since the pointer might be over a different key now)
      keyEl.onpointerout = keyEl.onpointerup = (e) => {
        keyEl.classList.remove("pressed");
      };
    });

    ////////// MOBILE-ONLY EVENTS

    document.addEventListener("touchstart", (e) => {
      const el = this._keyElFromTouchEvent(e);
      if (!el) return;
      el.classList.add("pressed");
      this.show(el);
      this.hoveredEl = el;
    });

    document.addEventListener("touchmove", (e) => {
      const el = this._keyElFromTouchEvent(e);
      if (!el || el === this.hoveredEl) return;

      // Hovering over a new element
      if (this.hoveredEl !== null) this.hoveredEl.classList.remove("pressed");
      el.classList.add("pressed");
      this.show(el);
      this.hoveredEl = el;
    });

    document.addEventListener("touchend", (e) => {
      this.hoveredEl.classList.remove("pressed");
      this.hide();
      this.hoveredEl = null;
    });
  }

  /**
   * Show a floating box with the letter of the pressed key so the user can see
   * past their thumbs.
   * @param {Element} keyEl
   */
  show(keyEl) {
    // Set preview text content
    this.previewEl.innerText = keyEl.innerText;

    // Set position and content of the preview
    const keyRect = keyEl.getBoundingClientRect();
    const previewRect = this.previewEl.getBoundingClientRect();

    this.previewEl.style.left = `${
      keyRect.x + keyRect.width / 2 - previewRect.width / 2
    }px`;
    this.previewEl.style.top = `${keyRect.y + KeyPressPreview.Y_OFF}px`;
  }

  hide() {
    this.previewEl.style.top = "-200px"; // Off the screen
    this.previewEl.innerText = "";
  }

  /**
   * @param {TouchEvent} e
   */
  _keyElFromTouchEvent(e) {
    const touch = e.touches[0];
    const x = touch.pageX,
      y = touch.pageY;

    const el = document.elementFromPoint(x, y);
    if (!el || !el.classList.contains("key")) return null; // Only care about keys
    return el;
  }
}

function removeElement(arr, toRemove) {
  const indexToRemove = arr.findIndex((el) => el === toRemove);
  arr.splice(indexToRemove, 1);
  return arr;
}

function init() {
  textBoxEl = document.getElementById("text");
  // Clear textbox; doesn't automatically clear on reload
  textBoxEl.value = "";
  const keyboardEl = document.getElementById("keyboard");
  keyboard = new Keyboard(keyboardEl);
}

// window.addEventListener("resize", (e) => {
//   screenWidth = document.documentElement.clientWidth;
// });

window.onload = init;
