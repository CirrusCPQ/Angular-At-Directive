angular.module('At', ['ngCaret'])
  .factory('AtUtils', function () {
    'use strict';

    var range = null;

    return {
      markRange: function () {
        range = this.getRange() || this.getIERange();
        return range;
      },

      getRange: function () {
        return window.getSelection ? window.getSelection().getRangeAt(0) : undefined;
      },

      getIERange: function () {
        return document.selection ? document.selection.createRange() : undefined;
      },

      getContent: function (element) {
        if (element.attr('contenteditable') === 'true') {
          return element.text();
        } else {
          return element.val();
        }
      },

      query: function (subtext, flag) {
        var regexp, match;

        regexp = new RegExp(flag + '([A-Za-z0-9_\\+\\-]*)$|' + flag + '([^\\x00-\\xff]*)$', 'gi');
        match = regexp.exec(subtext);

        if (match) {
          return match[2] || match[1];
        } else {
          return null;
        }
      },

      insert: function (element, content, data, query, range, ngModel) {
        var insertNode, pos, sel, source, startStr, text;
        if (element.attr('contenteditable') === 'true') {
          insertNode = angular.element('<span contenteditable="false">@' + data + '&nbsp;</span>');

          if (window.getSelection) {
            pos = range.startOffset - (query.endPos - query.headPos) - 1;
            range.setStart(range.endContainer, Math.max(pos, 0));
            range.setEnd(range.endContainer, range.endOffset);
            range.deleteContents();
            range.insertNode(insertNode[0]);
            range.collapse(false);
            sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          } else if (document.selection) {
            range.moveStart('character', query.endPos - query.headPos - 1);
            range.pasteHTML(insertNode[0]);
            range.collapse(false);
            range.select();
          }
        } else {
          source = element.val();
          startStr = source.slice(0, Math.max(query.headPos - 1, 0));
          if (startStr.length > 1 && startStr.charAt(startStr.length-1) !== ' ')
            data = ' '+data;
          text = startStr + data + ' ' + (source.slice(query.endPos || 0));
          element.val(text);
          ngModel.$setViewValue(text);
        }
      },

      select: {
        prev: function (cur, lists) {
          var prev;

          cur.removeClass('list-cur');
          prev = cur.prev();
          if (!prev.length) {
            prev = lists.last();
          }
          return prev.addClass('list-cur');
        },

        next: function (cur, lists) {
          var next;

          cur.removeClass('list-cur');
          next = cur.next();
          if (!next.length) {
            next = lists.first();
          }

          return next.addClass('list-cur');
        },

        choose: function (cur) {
          var content;

          cur.removeClass('list-cur');
          content = cur.find('span').text();

          return content;
        }
      }
    };
  })

  .directive('atUser', ['$http', '$timeout', 'Caret', 'AtUtils', function (
    $http,
    $timeout,
    Caret,
    AtUtils
  ) {
    'use strict';

    return {
      restrict: 'EA',
      link: function (scope, element, attrs) {
        var subtext, caretOffset;
        var flag = attrs.flag || '@';
        var lineHeight = scope.lineHeight || 16;
        var updateInterval = attrs.updateinterval || 5; //ms
        scope.isAtListHidden = true;
        
        scope.watchDelayIdle = updateInterval; //ms
        scope.watchDelayActive = 5; //ms
        scope.watchDelay = scope.watchDelayIdle;
        scope.watchTimer = false;

        scope.$watch(function () {
          return scope.caretPos;
        }, function (nowCaretPos) {
          if(scope.watchTimer){
            $timeout.cancel(scope.watchTimer)
          }  
          scope.watchTimer = $timeout(function(){
            if (angular.isDefined(nowCaretPos)) {
              scope.content = AtUtils.getContent(element);
              subtext = scope.content.slice(0, nowCaretPos);
              scope.query = AtUtils.query(subtext, flag);
              caretOffset = Caret.getOffset(element);

              if (scope.query === null) {
                scope.isAtListHidden = true;
                scope.watchDelay = scope.watchDelayIdle;
              }

              if (angular.isString(scope.query) && scope.query.length <= 10) {
                if (scope.query === '' && element.next().attr('auto-follow') === 'true') {
                  element.next().find('ul').css({
                    left: caretOffset.left,
                    top: caretOffset.top + lineHeight
                  });
                }
                scope.query = {
                  'text': scope.query,
                  'headPos': nowCaretPos - scope.query.length,
                  'endPos': nowCaretPos
                };
              }

              if (angular.isObject(scope.query)) {
                //scope.users = scope.response;
                scope.isAtListHidden = false;
                scope.watchDelay = scope.watchDelayActive;

                // $http.get('data/user.json').success(function (response) {
                //   scope.users = response.users;

                //   if (scope.users.length === 0) {
                //     scope.isAtListHidden = true;
                //   } else {
                //     scope.isAtListHidden = false;
                //     $timeout(function () {
                //       element.next().find('li').first().addClass('list-cur');
                //     });
                //   }
                // });
              }
            }
          },scope.watchDelay);
        });

        element.bind('blur', function () {
          scope.isAtListHidden = true;
          scope.watchDelay = scope.watchDelayIdle;
        });

        element.bind('click touch keyup', function () {
          scope.$apply(function () {
            scope.caretPos = Caret.getPos(element);
          });
        });
      }
    };
  }])

  .directive('autoComplete', ['Caret', 'AtUtils', function (
    Caret,
    AtUtils
  ) {
    'use strict';

    return {
      restrict: 'EA',
      require: 'ngModel',
      link: function (scope, element, attrs, ngModel) {
        var range;
        var span = element.next();
        var keyCode = {
          up: 38,
          down: 40,
          enter: 13,
          tab: 9
        };

        scope.autoComplete = function (object) {
          element[0].focus();
          AtUtils.insert(element, scope.content, object, scope.query, range, ngModel);
          Caret.setPos(element, scope.query.headPos + object.length + 1);
          scope.isAtListHidden = true;
        };

        span.bind('mouseenter', function () {
          var lists = span.find('li');
          range = AtUtils.markRange();
          lists.removeClass('list-cur');
        });

        element.bind('keydown', function (e) {
          var ul = element.next().find('ul');
          var lists = ul.find('li');
          var cur = ul.children('.list-cur');
          if (scope.isAtListHidden === false) {

            switch (e.keyCode) {

            case keyCode.up:
              e.originalEvent.preventDefault();
              AtUtils.select.prev(cur, lists);
              break;

            case keyCode.down:
              e.originalEvent.preventDefault();
              AtUtils.select.next(cur, lists);
              break;
              
            case keyCode.enter:
            case keyCode.tab:
              e.originalEvent.preventDefault();
              if(cur.length == 0) {
                AtUtils.select.next(cur,lists);
                cur = ul.children('.list-cur');
              }
              var insertContent = AtUtils.select.choose(cur);

              scope.$apply(function () {
                range = AtUtils.markRange();
                AtUtils.insert(element, scope.content, insertContent, scope.query, range, ngModel);
                scope.isAtListHidden = true;
                scope.stream.performSearch(scope.stream, scope.users);
              });
              Caret.setPos(element, scope.query.headPos + insertContent.length + 1);

              break;
            }
          }
        });
      }
    };
  }]);

