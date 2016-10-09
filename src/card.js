import _ from 'lodash';
import Sister from 'sister';
import Hammer from 'hammerjs';
import rebound from 'rebound';
import vendorPrefix from 'vendor-prefix';
import raf from 'raf';
import {
    elementChildren,
    isTouchDevice
} from './util';

/**
 * @param {Stack} stack
 * @param {HTMLElement} targetElement
 * @return {Object} An instance of Card.
 */
const Card = (stack, targetElement) => {
    let card,
        config,
        currentX,
        currentY,
        doMove,
        eventEmitter,
        isDraging,
        lastThrow,
        lastTranslate,
        lastX,
        lastY,
        mc,
        onSpringUpdate,
        springSystem,
        springThrowIn,
        springThrowOut,
        throwOutDistance,
        throwWhere;

    const construct = () => {
        card = {};
        config = Card.makeConfig(stack.getConfig());
        eventEmitter = Sister();
        springSystem = stack.getSpringSystem();
        springThrowIn = springSystem.createSpring(250, 10);
        springThrowOut = springSystem.createSpring(500, 20);
        lastThrow = {};
        lastTranslate = {
            x: 0,
            y: 0
        };

        springThrowIn.setRestSpeedThreshold(0.05);
        springThrowIn.setRestDisplacementThreshold(0.05);

        springThrowOut.setRestSpeedThreshold(0.05);
        springThrowOut.setRestDisplacementThreshold(0.05);

        throwOutDistance = config.throwOutDistance(config.minThrowOutDistance, config.maxThrowOutDistance);

        mc = new Hammer.Manager(targetElement, {
            recognizers: [
                [
                    Hammer.Pan,
                    {
                        threshold: 2
                    }
                ]
            ]
        });

        Card.appendToParent(targetElement);

        eventEmitter.on('panstart', () => {
            //Card.appendToParent(targetElement);
            Card.recalculateTranslateZ(targetElement);

            eventEmitter.trigger('dragstart', {
                target: targetElement
            });

            currentX = 0;
            currentY = 0;

            isDraging = true;

            (function animation () {
                if (isDraging) {
                    doMove();

                    raf(animation);
                }
            })();
        });

        eventEmitter.on('panmove', (e) => {
            currentX = e.deltaX;
            currentY = e.deltaY;
        });

        eventEmitter.on('panend', (e) => {
            isDraging = false;

            var x = lastTranslate.x + e.deltaX;
            var y = lastTranslate.y + e.deltaY;

            if (config.isThrowOut(x, targetElement, config.throwOutConfidence(x, targetElement))) {
                console.log(x,y);
                const pileCoord = (x < 0)? config.leftPileCoord:config.rightPileCoord;
                if(pileCoord){
                    x = (isNaN(pileCoord.x))? x:pileCoord.x;
                    y = (isNaN(pileCoord.y))? y:pileCoord.y;
                } 
                card.throwOut(x, y);
            } else {
                card.throwIn(x, y);
            }

            eventEmitter.trigger('dragend', {
                target: targetElement
            });
        });

        // "mousedown" event fires late on touch enabled devices, thus listening
        // to the touchstart event for touch enabled devices and mousedown otherwise.
        if (isTouchDevice()) {
            targetElement.addEventListener('touchstart', () => {
                eventEmitter.trigger('panstart');
            });

            // Disable scrolling while dragging the element on the touch enabled devices.
            // @see http://stackoverflow.com/a/12090055/368691
            (() => {
                let dragging;

                targetElement.addEventListener('touchstart', () => {
                    dragging = true;
                });

                targetElement.addEventListener('touchend', () => {
                    dragging = false;
                });

                global.addEventListener('touchmove', (e) => {
                    if (dragging) {
                        e.preventDefault();
                    }
                });
            })();
        } else {
            targetElement.addEventListener('mousedown', () => {
                eventEmitter.trigger('panstart');
            });
        }

        mc.on('panmove', (e) => {
            eventEmitter.trigger('panmove', e);
        });

        mc.on('panend', (e) => {
            eventEmitter.trigger('panend', e);
        });

        springThrowIn.addListener({
            onSpringUpdate: (spring) => {
                const value = spring.getCurrentValue();
                const x = rebound.MathUtil.mapValueInRange(value, 0, 1, lastThrow.fromX, 0);
                const y = rebound.MathUtil.mapValueInRange(value, 0, 1, lastThrow.fromY, 0);

                onSpringUpdate(x, y);
            },
            onSpringAtRest: () => {
                eventEmitter.trigger('throwinend', {
                    target: targetElement
                });
            }
        });

        springThrowOut.addListener({
            onSpringUpdate: (spring) => {
                const value = spring.getCurrentValue();
                const x = rebound.MathUtil.mapValueInRange(value, 0, 1, lastThrow.fromX, throwOutDistance * lastThrow.direction);
                const y = lastThrow.fromY;

                onSpringUpdate(x, y);
            },
            onSpringAtRest: () => {
                eventEmitter.trigger('throwoutend', {
                    target: targetElement
                });
            }
        });

        /**
         * Transforms card position based on the current environment variables.
         *
         * @return {undefined}
         */
        doMove = () => {
            let r,
                x,
                y;

            if (currentX === lastX && currentY === lastY) {
                return;
            }
            raf(()=>{

                lastX = currentX;
                lastY = currentY;

                x = lastTranslate.x + currentX;
                y = lastTranslate.y + currentY;
                r = config.rotation(x, y, targetElement, config.maxRotation);

                config.transform(targetElement, x, y, r);

                eventEmitter.trigger('dragmove', {
                    target: targetElement,
                    throwOutConfidence: config.throwOutConfidence(x, targetElement),
                    throwDirection: x < 0 ? Card.DIRECTION_LEFT : Card.DIRECTION_RIGHT,
                    offset: x
                });

            })
        };

        /**
         * Invoked every time the physics solver updates the Spring's value.
         *
         * @param {Number} x
         * @param {Number} y
         * @return {undefined}
         */
        onSpringUpdate = (x, y) => {
            raf(()=>{
                let r;

                r = config.rotation(x, y, targetElement, config.maxRotation);

                lastTranslate.x = x || 0;
                lastTranslate.y = y || 0;

                Card.transform(targetElement, x, y, r);

            })
        };

        /**
         * @param {Card.THROW_IN|Card.THROW_OUT} where
         * @param {Number} fromX
         * @param {Number} fromY
         * @return {undefined}
         */
        throwWhere = (where, fromX, fromY) => {
            lastThrow.fromX = fromX;
            lastThrow.fromY = fromY;
            lastThrow.direction = lastThrow.fromX < 0 ? Card.DIRECTION_LEFT : Card.DIRECTION_RIGHT;

            Card.recalculateTranslateZ(targetElement);

            if (where === Card.THROW_IN) {
                springThrowIn.setCurrentValue(0).setAtRest().setEndValue(1);

                eventEmitter.trigger('throwin', {
                    target: targetElement,
                    throwDirection: lastThrow.direction
                });
            } else if (where === Card.THROW_OUT) {
                springThrowOut.setCurrentValue(0).setAtRest().setVelocity(100).setEndValue(1);

                eventEmitter.trigger('throwout', {
                    target: targetElement,
                    throwDirection: lastThrow.direction
                });

                if (lastThrow.direction === Card.DIRECTION_LEFT) {
                    eventEmitter.trigger('throwoutleft', {
                        target: targetElement,
                        throwDirection: lastThrow.direction
                    });
                } else {
                    eventEmitter.trigger('throwoutright', {
                        target: targetElement,
                        throwDirection: lastThrow.direction
                    });
                }
            } else {
                throw new Error('Invalid throw event.');
            }
        };
    };

    construct();

    /**
     * Alias
     */
    card.on = eventEmitter.on;
    card.trigger = eventEmitter.trigger;

    /**
     * Throws a card into the stack from an arbitrary position.
     *
     * @param {Number} fromX
     * @param {Number} fromY
     * @return {undefined}
     */
    card.throwIn = (fromX, fromY) => {
        throwWhere(Card.THROW_IN, fromX, fromY);
    };

    /**
     * Throws a card out of the stack in the direction away from the original offset.
     *
     * @param {Number} fromX
     * @param {Number} fromY
     * @return {undefined}
     */
    card.throwOut = (fromX, fromY) => {
        throwWhere(Card.THROW_OUT, fromX, fromY);
    };

    /**
     * Unbinds all Hammer.Manager events.
     * Removes the listeners from the physics simulation.
     *
     * @return {undefined}
     */
    card.destroy = () => {
        mc.destroy();
        springThrowIn.destroy();
        springThrowOut.destroy();

        stack.destroyCard(card);
    };

    return card;
};

/**
 * Creates a configuration object.
 *
 * @param {Object} config
 * @return {Object}
 */
Card.makeConfig = (config = {}) => {
    const defaultConfig = {
        isThrowOut: Card.isThrowOut,
        throwOutConfidence: Card.throwOutConfidence,
        throwOutDistance: Card.throwOutDistance,
        minThrowOutDistance: 400,
        maxThrowOutDistance: 500,
        rotation: Card.rotation,
        leftPileCoord: null,
        rightPileCoord: null,
        maxRotation: 20,
        transform: Card.transform
    };

    return _.assign({}, defaultConfig, config);
};

/**
 * Uses CSS transform to translate element position and rotation.
 *
 * Invoked in the event of `dragmove` and every time the physics solver is triggered.
 *
 * @param {HTMLElement} element
 * @param {Number} x Horizontal offset from the startDrag.
 * @param {Number} y Vertical offset from the startDrag.
 * @param {Number} r
 * @return {undefined}
 */
Card.transform = (element, x, y, r) => {
    raf(()=>{
        var tz = element.style[vendorPrefix('transform')];
        var match = tz.match(/translate3d\(\-?\d+px\,\s*\-?\d+px\,\s*\-?\d+px\)/gi);
        var [x_px, y_px, z_px] = (match.length)?match[0].match(/\-?\d+px/gi):['0px','0px','0px'];
        element.style[vendorPrefix('transform')] = 
        `translate3d(${Math.round(x)}px, ${Math.round(y)}px, ${z_px}) rotate(${r}deg)`;
    })
};

Card.recalculateTranslateZ = (targetElement, resetStack) =>{
    // We should use translate3d to set the z-ordering of the cards 
    // instead of detaching and reattaching node to container
    // This reduces the DOM node re-rendering
    raf(()=>{
        for (var i = 0; i < targetElement.parentNode.children.length; i++) {
            var tz = targetElement.parentNode.children[i].style[vendorPrefix('transform')];
            var match = tz.match(/translate3d\(\-?\d+px\,\s*\-?\d+px\,\s*\-?\d+px\)/gi);
            var [_unused, x, y, z] = (match.length)?match[0].match(/\-?\d+/gi):[null,'0','0','0'];
            z=(targetElement.parentNode.children[i] !== targetElement)? Math.max(Number(z)-1,0): targetElement.parentNode.children.length-1;
            x=(resetStack)? 0:x;
            y=(resetStack)? 0:y;
            z=(resetStack)? i:z;


            targetElement.parentNode.children[i].style[vendorPrefix('transform')] = tz
            .replace(
                /translate3d\(\-?\d+px\,\s*\-?\d+px\,\s*\-?\d+px\)/gi,
                `translate3d(${x}px, ${y}px, ${z}px)`
            );
        };
    });
}

/**
 * Append element to the parentNode.
 *
 * This makes the element first among the siblings. The reason for using
 * this as opposed to zIndex is to allow CSS selector :nth-child.
 *
 * Invoked in the event of mousedown.
 * Invoked when card is added to the stack.
 *
 * @param {HTMLElement} element The target element.
 * @return {undefined}
 */
Card.appendToParent = (element) => {
    const parentNode = element.parentNode;
    const siblings = elementChildren(parentNode);
    const targetIndex = siblings.indexOf(element);

    if (targetIndex + 1 !== siblings.length) {
        parentNode.removeChild(element);
        parentNode.appendChild(element);
    }
};

/**
 * Returns a value between 0 and 1 indicating the completeness of the throw out condition.
 *
 * Ration of the absolute distance from the original card position and element width.
 *
 * @param {Number} offset Distance from the dragStart.
 * @param {HTMLElement} element Element.
 * @return {Number}
 */
Card.throwOutConfidence = (offset, element) => {
    return Math.min(Math.abs(offset) / element.offsetWidth, 1);
};

/**
 * Determines if element is being thrown out of the stack.
 *
 * Element is considered to be thrown out when throwOutConfidence is equal to 1.
 *
 * @param {Number} offset Distance from the dragStart.
 * @param {HTMLElement} element Element.
 * @param {Number} throwOutConfidence config.throwOutConfidence
 * @return {Boolean}
 */
Card.isThrowOut = (offset, element, throwOutConfidence) => {
    return throwOutConfidence === 1;
};

/**
 * Calculates a distances at which the card is thrown out of the stack.
 *
 * @param {Number} min
 * @param {Number} max
 * @return {Number}
 */
Card.throwOutDistance = (min, max) => {
    return _.random(min, max);
};

/**
 * Calculates rotation based on the element x and y offset, element width and maxRotation variables.
 *
 * @param {Number} x Horizontal offset from the startDrag.
 * @param {Number} y Vertical offset from the startDrag.
 * @param {HTMLElement} element Element.
 * @param {Number} maxRotation
 * @return {Number} Rotation angle expressed in degrees.
 */
Card.rotation = (x, y, element, maxRotation) => {
    const horizontalOffset = Math.min(Math.max(x / element.offsetWidth, -1), 1);
    const verticalOffset = (y > 0 ? 1 : -1) * Math.min(Math.abs(y) / 100, 1);
    const rotation = horizontalOffset * verticalOffset * maxRotation;

    return rotation;
};

Card.DIRECTION_LEFT = -1;
Card.DIRECTION_RIGHT = 1;

Card.THROW_IN = 'in';
Card.THROW_OUT = 'out';

export default Card;
