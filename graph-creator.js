document.onload = (function (d3, saveAs, Blob, undefined) {
    "use strict";

    // define graphcreator object
    let GraphCreator = function (svg, nodes, edges) {
        let thisGraph = this;
        thisGraph.idct = 0;

        thisGraph.nodes = nodes || [];
        thisGraph.edges = edges || [];

        thisGraph.state = {
            selectedNode: null,
            selectedEdge: null,
            mouseDownNode: null,
            mouseEnterNode: null,
            mouseDownLink: null,
            justDragged: false,
            justScaleTransGraph: false,
            lastKeyDown: -1,
            shiftNodeDrag: false,
            selectedText: null
        };

        // define arrow markers for graph links
        let defs = svg.append('svg:defs');
        defs.append('svg:marker')
            .attr('id', 'end-arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', "32")
            .attr('markerWidth', 3.5)
            .attr('markerHeight', 3.5)
            .attr('orient', 'auto')
            .append('svg:path')
            .attr('d', 'M0,-5L10,0L0,5');

        // define arrow markers for leading arrow
        defs.append('svg:marker')
            .attr('id', 'mark-end-arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 7)
            .attr('markerWidth', 3.5)
            .attr('markerHeight', 3.5)
            .attr('orient', 'auto')
            .append('svg:path')
            .attr('d', 'M0,-5L10,0L0,5');

        thisGraph.svg = svg;
        thisGraph.svgG = svg.append("g")
            .classed(thisGraph.consts.graphClass, true);
        let svgG = thisGraph.svgG;

        // displayed when dragging between nodes
        thisGraph.dragLine = svgG.append('svg:path')
            .attr('class', 'link dragline hidden')
            .attr('d', 'M0,0L0,0')
            .style('marker-end', 'url(#mark-end-arrow)');

        // svg nodes and edges
        thisGraph.paths = svgG.append("g").selectAll("g");
        thisGraph.circles = svgG.append("g").selectAll("g");

        thisGraph.drag = d3.drag()
            .subject(function (d) {
                return {x: d.x, y: d.y};
            })
            .on("drag", function (args) {
                thisGraph.state.justDragged = true;
                thisGraph.dragmove.call(thisGraph, args);
            })
            .on("end", function (d) {
                // todo check if edge-mode is selected
                var mouse = d3.mouse(this);
                var elem = document.elementFromPoint(mouse[0], mouse[1]);
                if (thisGraph.state.shiftNodeDrag) {
                    thisGraph.dragEnd.call(thisGraph, d3.select(this), thisGraph.state.mouseEnterNode)
                }

            });

        // listen for key events
        d3.select(window).on("keydown", function () {
            thisGraph.svgKeyDown.call(thisGraph);
        })
            .on("keyup", function () {
                thisGraph.svgKeyUp.call(thisGraph);
            });
        svg.on("mousedown", function (d) {
            thisGraph.svgMouseDown.call(thisGraph, d);
            if (d3.event.shiftKey) {
                d3.event.stopImmediatePropagation();
            }
        });
        svg.on("mouseup", function (d) {
            thisGraph.svgMouseUp.call(thisGraph, d);
        });

        // listen for dragging
        let dragSvg = d3.zoom()
            .on("zoom", function () {
                if (d3.event.sourceEvent.shiftKey) {
                    // TODO  the internal d3 state is still changing
                    return false;
                } else {
                    thisGraph.zoomed.call(thisGraph);
                }
                return true;
            })
            .on("start", function () {
                var ael = d3.select("#" + thisGraph.consts.activeEditId).node();
                if (ael) {
                    ael.blur();
                }
                if (!d3.event.sourceEvent.shiftKey) d3.select('body').style("cursor", "move");
            })
            .on("end", function () {
                d3.select('body').style("cursor", "auto");
            });

        svg.call(dragSvg).on("dblclick.zoom", null);

        // listen for resize
        window.onresize = function () {
            thisGraph.updateWindow(svg);
        };

        // handle download data
        d3.select("#download-input").on("click", function () {
            let saveEdges = [];
            thisGraph.edges.forEach(function (val, i) {
                saveEdges.push({source: val.source.id, target: val.target.id});
            });
            let blob = new Blob([window.JSON.stringify({
                "nodes": thisGraph.nodes,
                "edges": saveEdges
            })], {type: "text/plain;charset=utf-8"});
            saveAs(blob, "mydag.json");
        });


        // handle uploaded data
        d3.select("#upload-input").on("click", function () {
            document.getElementById("hidden-file-upload").click();
        });
        d3.select("#hidden-file-upload").on("change", function () {
            if (window.File && window.FileReader && window.FileList && window.Blob) {
                let uploadFile = this.files[0];
                let filereader = new window.FileReader();

                filereader.onload = function () {
                    let txtRes = filereader.result;
                    // TODO better error handling
                    try {
                        let jsonObj = JSON.parse(txtRes);
                        thisGraph.deleteGraph(true);
                        thisGraph.nodes = jsonObj.nodes;
                        thisGraph.setIdCt(jsonObj.nodes.length + 1);
                        let newEdges = jsonObj.edges;
                        newEdges.forEach(function (e, i) {
                            newEdges[i] = {
                                source: thisGraph.nodes.filter(function (n) {
                                    return n.id === e.source;
                                })[0],
                                target: thisGraph.nodes.filter(function (n) {
                                    return n.id === e.target;
                                })[0]
                            };
                        });
                        thisGraph.edges = newEdges;
                        thisGraph.updateGraph();
                    } catch (err) {
                        window.alert("Error parsing uploaded file\nerror message: " + err.message);
                        return;
                    }
                };
                filereader.readAsText(uploadFile);

            } else {
                alert("Your browser won't let you save this graph -- try upgrading your browser to IE 10+ or Chrome or Firefox.");
            }

        });

        // handle delete graph
        d3.select("#delete-graph").on("click", function () {
            thisGraph.deleteGraph(false);
        });
    };

    GraphCreator.prototype.setIdCt = function (idct) {
        this.idct = idct;
    };

    GraphCreator.prototype.consts = {
        selectedClass: "selected",
        connectClass: "connect-node",
        circleGClass: "conceptG",
        graphClass: "graph",
        activeEditId: "active-editing",
        BACKSPACE_KEY: 8,
        DELETE_KEY: 46,
        ENTER_KEY: 13,
        nodeRadius: 50
    };

    /* PROTOTYPE FUNCTIONS */

    GraphCreator.prototype.dragmove = function (d) {
        let thisGraph = this;
        if (thisGraph.state.shiftNodeDrag) {
            thisGraph.dragLine.attr('d', 'M' + d.x + ',' + d.y + 'L' + d3.mouse(thisGraph.svgG.node())[0] + ',' + d3.mouse(this.svgG.node())[1]);
        } else {
            d.x += d3.event.dx;
            d.y += d3.event.dy;
            thisGraph.updateGraph();
        }
    };

    GraphCreator.prototype.deleteGraph = function (skipPrompt) {
        let thisGraph = this,
            doDelete = true;
        if (!skipPrompt) {
            doDelete = window.confirm("Press OK to delete this graph");
        }
        if (doDelete) {
            thisGraph.nodes = [];
            thisGraph.edges = [];
            thisGraph.updateGraph();
        }
    };

    /* select all text in element: taken from http://stackoverflow.com/questions/6139107/programatically-select-text-in-a-contenteditable-html-element */
    GraphCreator.prototype.selectElementContents = function (el) {
        let range = document.createRange();
        range.selectNodeContents(el);
        let sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    };


    /* insert svg line breaks: taken from http://stackoverflow.com/questions/13241475/how-do-i-include-newlines-in-labels-in-d3-charts */
    GraphCreator.prototype.insertTitleLinebreaks = function (gEl, title) {
        let words = title.split(/\s+/g),
            nwords = words.length;
        let el = gEl.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "-" + (nwords - 1) * 7.5);

        for (let i = 0; i < words.length; i++) {
            let tspan = el.append('tspan').text(words[i]);
            if (i > 0)
                tspan.attr('x', 0).attr('dy', '15');
        }
    };


    // remove edges associated with a node
    GraphCreator.prototype.spliceLinksForNode = function (node) {
        let thisGraph = this,
            toSplice = thisGraph.edges.filter(function (l) {
                return (l.source === node || l.target === node);
            });
        toSplice.map(function (l) {
            thisGraph.edges.splice(thisGraph.edges.indexOf(l), 1);
        });
    };

    GraphCreator.prototype.replaceSelectEdge = function (d3Path, edgeData) {
        let thisGraph = this;
        d3Path.classed(thisGraph.consts.selectedClass, true);
        if (thisGraph.state.selectedEdge) {
            thisGraph.removeSelectFromEdge();
        }
        thisGraph.state.selectedEdge = edgeData;
    };

    GraphCreator.prototype.replaceSelectNode = function (d3Node, nodeData) {
        let thisGraph = this;
        d3Node.classed(this.consts.selectedClass, true);
        if (thisGraph.state.selectedNode) {
            thisGraph.removeSelectFromNode();
        }
        thisGraph.state.selectedNode = nodeData;
    };

    GraphCreator.prototype.removeSelectFromNode = function () {
        let thisGraph = this;
        thisGraph.circles.filter(function (cd) {
            return cd.id === thisGraph.state.selectedNode.id;
        }).classed(thisGraph.consts.selectedClass, false);
        thisGraph.state.selectedNode = null;
    };

    GraphCreator.prototype.removeSelectFromEdge = function () {
        let thisGraph = this;
        thisGraph.paths.filter(function (cd) {
            return cd === thisGraph.state.selectedEdge;
        }).classed(thisGraph.consts.selectedClass, false);
        thisGraph.state.selectedEdge = null;
    };

    GraphCreator.prototype.pathMouseDown = function (d3path, d) {
        let thisGraph = this,
            state = thisGraph.state;
        d3.event.stopPropagation();
        state.mouseDownLink = d;

        if (state.selectedNode) {
            thisGraph.removeSelectFromNode();
        }

        let prevEdge = state.selectedEdge;
        if (!prevEdge || prevEdge !== d) {
            thisGraph.replaceSelectEdge(d3path, d);
        } else {
            thisGraph.removeSelectFromEdge();
        }
    };

    // mousedown on node
    GraphCreator.prototype.circleMouseDown = function (d3node, d) {
        let thisGraph = this,
            state = thisGraph.state;
        d3.event.stopPropagation();
        state.mouseDownNode = d;
        console.log(`mousedownnode = ${JSON.stringify(d)}`);
        if (d3.event.shiftKey) {
            state.shiftNodeDrag = d3.event.shiftKey;
            // reposition dragged directed edge
            thisGraph.dragLine.classed('hidden', false)
                .attr('d', 'M' + d.x + ',' + d.y + 'L' + d.x + ',' + d.y);
            return;
        }
    };

    /* place editable text on node in place of svg text */
    GraphCreator.prototype.changeTextOfNode = function (d3node, d) {
        let thisGraph = this,
            consts = thisGraph.consts,
            htmlEl = d3node.node();
        d3node.selectAll("text").remove();
        let nodeBCR = htmlEl.getBoundingClientRect(),
            curScale = nodeBCR.width / consts.nodeRadius,
            placePad = 5 * curScale,
            useHW = curScale > 1 ? nodeBCR.width * 0.71 : consts.nodeRadius * 1.42;
        // replace with editableconent text
        let d3txt = thisGraph.svg.selectAll("foreignObject")
            .data([d])
            .enter()
            .append("foreignObject")
            .attr("x", nodeBCR.left + placePad)
            .attr("y", nodeBCR.top + placePad)
            .attr("height", 2 * useHW)
            .attr("width", useHW)
            .append("xhtml:p")
            .attr("id", consts.activeEditId)
            .attr("contentEditable", "true")
            .text(d.title)
            .on("mousedown", function (d) {
                d3.event.stopPropagation();
            })
            .on("keydown", function (d) {
                d3.event.stopPropagation();
                if (d3.event.keyCode == consts.ENTER_KEY && !d3.event.shiftKey) {
                    this.blur();
                }
            })
            .on("blur", function (d) {
                d.title = this.textContent;
                thisGraph.insertTitleLinebreaks(d3node, d.title);
                d3.select(this.parentElement).remove();
            });
        return d3txt;
    };

    GraphCreator.prototype.dragEnd = function (d3node, d) {
        console.log('dragend');
        let thisGraph = this,
            state = thisGraph.state,
            consts = thisGraph.consts;
        // reset the states
        state.shiftNodeDrag = false;
        d3node.classed(consts.connectClass, false);

        let mouseDownNode = state.mouseDownNode;
        let mouseEnterNode = state.mouseEnterNode;

        if (state.justDragged) {
            // dragged, not clicked
            state.justDragged = false;
        }

        thisGraph.dragLine.classed("hidden", true);

        if (!mouseDownNode || !mouseEnterNode) return;


        if (mouseDownNode !== d) {
            // we're in a different node: create new edge for mousedown edge and add to graph
            let newEdge = {source: mouseDownNode, target: d};
            let filtRes = thisGraph.paths.filter(function (d) {
                if (d.source === newEdge.target && d.target === newEdge.source) {
                    thisGraph.edges.splice(thisGraph.edges.indexOf(d), 1);
                }
                return d.source === newEdge.source && d.target === newEdge.target;
            });
            if (!filtRes || !filtRes[0] || !filtRes[0].length) {
                thisGraph.edges.push(newEdge);
                thisGraph.updateGraph();
            }
        }


        state.mouseDownNode = null;
        state.mouseEnterNode = null;
        return;
    };

    // mouseup on nodes
    GraphCreator.prototype.circleMouseUp = function (d3node, d) {
        console.log('mouse up');
        let thisGraph = this,
            state = thisGraph.state,
            consts = thisGraph.consts;
        // reset the states
        state.shiftNodeDrag = false;
        d3node.classed(consts.connectClass, false);

        if (d3.event.shiftKey) {
            // shift-clicked node: edit text content
            let d3txt = thisGraph.changeTextOfNode(d3node, d);
            let txtNode = d3txt.node();
            thisGraph.selectElementContents(txtNode);
            txtNode.focus();
        } else {
            if (state.selectedEdge) {
                thisGraph.removeSelectFromEdge();
            }
        }

        let prevNode = state.selectedNode;
        if (!prevNode || prevNode.id !== d.id) {
            thisGraph.replaceSelectNode(d3node, d);
        } else {
            thisGraph.removeSelectFromNode();
        }

    }; // end of circles mouseup

    // mousedown on main svg
    GraphCreator.prototype.svgMouseDown = function () {
        this.state.graphMouseDown = true;
    };

    // mouseup on main svg
    GraphCreator.prototype.svgMouseUp = function () {
        let thisGraph = this,
            state = thisGraph.state;
        if (state.justScaleTransGraph) {
            // dragged not clicked
            state.justScaleTransGraph = false;
        } else if (state.graphMouseDown && d3.event.shiftKey) {
            // clicked not dragged from svg
            let xycoords = d3.mouse(thisGraph.svgG.node()),
                d = {id: thisGraph.idct++, title: "new concept", x: xycoords[0], y: xycoords[1]};
            thisGraph.nodes.push(d);
            thisGraph.updateGraph();
            // make title of text immediently editable
            let d3txt = thisGraph.changeTextOfNode(thisGraph.circles.filter(function (dval) {
                    return dval.id === d.id;
                }), d),
                txtNode = d3txt.node();
            thisGraph.selectElementContents(txtNode);
            txtNode.focus();
        } else if (state.shiftNodeDrag) {
            // dragged from node
            state.shiftNodeDrag = false;
            thisGraph.dragLine.classed("hidden", true);
        }
        state.graphMouseDown = false;
    };

    // keydown on main svg
    GraphCreator.prototype.svgKeyDown = function () {
        let thisGraph = this,
            state = thisGraph.state,
            consts = thisGraph.consts;
        // make sure repeated key presses don't register for each keydown
        if (state.lastKeyDown !== -1) return;

        state.lastKeyDown = d3.event.keyCode;
        let selectedNode = state.selectedNode,
            selectedEdge = state.selectedEdge;

        switch (d3.event.keyCode) {
            case consts.BACKSPACE_KEY:
            case consts.DELETE_KEY:
                d3.event.preventDefault();
                if (selectedNode) {
                    thisGraph.nodes.splice(thisGraph.nodes.indexOf(selectedNode), 1);
                    thisGraph.spliceLinksForNode(selectedNode);
                    state.selectedNode = null;
                    thisGraph.updateGraph();
                } else if (selectedEdge) {
                    thisGraph.edges.splice(thisGraph.edges.indexOf(selectedEdge), 1);
                    state.selectedEdge = null;
                    thisGraph.updateGraph();
                }
                break;
        }
    };

    GraphCreator.prototype.svgKeyUp = function () {
        this.state.lastKeyDown = -1;
    };

    // call to propagate changes to graph
    GraphCreator.prototype.updateGraph = function () {

        let thisGraph = this,
            consts = thisGraph.consts,
            state = thisGraph.state;

        thisGraph.paths = thisGraph.paths.data(thisGraph.edges, function (d) {
            return String(d.source.id) + "+" + String(d.target.id);
        });
        let paths = thisGraph.paths;
        // update existing paths
        paths.style('marker-end', 'url(#end-arrow)')
            .classed(consts.selectedClass, function (d) {
                return d === state.selectedEdge;
            })
            // .attr("d", line([d.source.x, d.source.y, d.target.x, d.target.y]));
            .attr("d", function (d) {
                return "M" + d.source.x + "," + d.source.y + "L" + d.target.x  + "," + d.target.y;
            });

        // remove old links
        paths.exit().remove();

        // add new paths
        paths = paths.enter()
            .append("path")
            .style('marker-end', 'url(#end-arrow)')
            .classed("link", true)
            .attr("d", function (d) {
                return "M" + d.source.x + "," + d.source.y + "L" + d.target.x  + "," + d.target.y;
            })
            .merge(paths)
            .on("mouseup", function (d) {
                console.log('mouseup link');
                // state.mouseDownLink = null;
            })
            .on("mousedown", function (d) {
                    thisGraph.pathMouseDown.call(thisGraph, d3.select(this), d);
                }
            );

        thisGraph.paths = paths;

        // update existing nodes
        thisGraph.circles = thisGraph.circles.data(thisGraph.nodes, function (d) {
            return d.id;
        });

        // remove old nodes
        thisGraph.circles.exit().remove();

        thisGraph.circles.attr("transform", function (d) {
            return "translate(" + d.x + "," + d.y + ")";
        });


        // add new nodes
        let newGs = thisGraph.circles.enter()
            .append("g").merge(thisGraph.circles);

        newGs.classed(consts.circleGClass, true)
            .attr("transform", function (d) {
                return "translate(" + d.x + "," + d.y + ")";
            })
            .on("mouseover", function (d) {
                state.mouseEnterNode = d;
                if (state.shiftNodeDrag) {
                    d3.select(this).classed(consts.connectClass, true);
                }
            })
            .on("mouseout", function (d) {
                state.mouseEnterNode = null;
                d3.select(this).classed(consts.connectClass, false);
            })
            .on("mousedown", function (d) {
                thisGraph.circleMouseDown.call(thisGraph, d3.select(this), d);
            })
            .call(thisGraph.drag)
            .on("click", function (d) {
                thisGraph.circleMouseUp.call(thisGraph, d3.select(this), d);
            });

        thisGraph.circles = newGs;

        newGs.each(function(d) {
          if (this.childNodes.length === 0) {
            d3.select(this)
              .append("circle")
              .attr("r", String(consts.nodeRadius));
            thisGraph.insertTitleLinebreaks(d3.select(this), d.title);
          }
        });

    };

    GraphCreator.prototype.zoomed = function () {
        this.state.justScaleTransGraph = true;
        d3.select("." + this.consts.graphClass)
            .attr("transform", d3.event.transform);
    };

    GraphCreator.prototype.updateWindow = function (svg) {
        let docEl = document.documentElement,
            bodyEl = document.getElementsByTagName('body')[0];
        let x = window.innerWidth || docEl.clientWidth || bodyEl.clientWidth;
        let y = window.innerHeight || docEl.clientHeight || bodyEl.clientHeight;
        svg.attr("width", x).attr("height", y);
    };


    /**** MAIN ****/

    // warn the user when leaving
    window.onbeforeunload = function () {
        return "Make sure to save your graph locally before leaving :-)";
    };

    let docEl = document.documentElement,
        bodyEl = document.getElementsByTagName('body')[0];

    let width = window.innerWidth || docEl.clientWidth || bodyEl.clientWidth,
        height = window.innerHeight || docEl.clientHeight || bodyEl.clientHeight;

    let xLoc = width / 2 - 25,
        yLoc = 100;

    // initial node data
    let nodes = [{title: "new concept", id: 0, x: xLoc, y: yLoc},
        {title: "new concept", id: 1, x: xLoc, y: yLoc + 200}];
    let edges = [{source: nodes[1], target: nodes[0]}];


    /** MAIN SVG **/
    let svg = d3.select("body").append("svg")
        .attr("width", width)
        .attr("height", height);
    let graph = new GraphCreator(svg, nodes, edges);
    graph.setIdCt(2);
    graph.updateGraph();
})(window.d3, window.saveAs, window.Blob);
