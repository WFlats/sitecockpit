sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/routing/History",
	"sap/ui/model/Filter",
	"sap/ui/model/Sorter",
	"sap/ui/model/FilterOperator",
	"sap/m/GroupHeaderListItem",
	"sap/ui/Device",
	"sap/m/Dialog",
	"sap/ui/core/Fragment",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"../model/formatter",
	"sap/ui/events/ControlEvents"
], function (BaseController, JSONModel, History, Filter, Sorter, FilterOperator, GroupHeaderListItem, Device, Dialog, Fragment,
	MessageBox, MessageToast, formatter, ControlEvents) {
	"use strict";

	return BaseController.extend("cockpit.Cockpit.controller.Master", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when the master list controller is instantiated. It sets up the event handling for the master/detail communication and other lifecycle tasks.
		 * @public
		 */
		onInit: function () {
			// Control state model
			var oList = this.byId("projectTreeTable"),
				oViewModel = this._createViewModel(),
				iOriginalBusyDelay = oList.getBusyIndicatorDelay();

			this._oList = oList;
			// keeps the filter and search state
			this._oListFilterState = {
				aFilter: [],
				aSearch: []
			};

			this.setModel(oViewModel, "masterView");
			// Make sure, busy indication is showing immediately so there is no
			// break after the busy indication for loading the view's meta data is
			// ended (see promise 'oWhenMetadataIsLoaded' in AppController)
			oList.attachEventOnce("updateFinished", function () {
				// Restore original busy indicator delay for the list
				oViewModel.setProperty("/delay", iOriginalBusyDelay);
			});

			this.byId("menuButton").attachBrowserEvent("tab keyup", function (oEvent) {
				this._bKeyboard = oEvent.type === "keyup";
			}, this);

			var oContextMenu = sap.ui.xmlfragment("cockpit.Cockpit.view.LocationContextMenu", this);
			oList.setContextMenu(oContextMenu);

			// find to which project(s) the user has access
			// if more than one, let the user select
			var oModel = this.getOwnerComponent().getModel(),
				oAppView = this.getModel("appView"),
				that = this;
			oModel.metadataLoaded().then(function () {
				oModel.read("/Projects", { // reads only filtered by role attribut
					success: function (oData) {
						if (oData && oData.results.length > 0) {
							if (oData.results.length === 1) {
								oAppView.setProperty("/selectedProjectID", oData.results[0].ID);
								that.setProjectBC(oData.results[0].ID);
							} else {
								that.selectProject(); // sets bidingContext, appView
							}
						} else {
							MessageBox.Alert("You have no access rights to projects!");
						}
					},
					error: function (oResult) {
						MessageBox.Alert("Error accessing projects: " + oResult.statusCode + " - " + oResult.statusText);
					}
				});
			});
			// initialise listSelector
			this.getView().addEventDelegate({
				onBeforeFirstShow: function () {
					this.getOwnerComponent().oListSelector.setBoundMasterList(oList);
				}.bind(this)
			});
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */
		/*
				onAfterRendering: function () {
					var sProjectID = this.getModel("appView").getProperty("/selectedProjectI"),
						oFilter = new Filter("project_ID", FilterOperator.EQ, sProjectID),
						oSorter = new Sorter("code");
					//this._oList.getBinding("rows").filter(oFilter, "Application");
					this._oList.getBinding("rows").sort(oSorter);
				},
		*/
		setProjectBC: function (sID) {
			var oModel = this.getModel(),
				sTitle,
				oList = this.byId("projectTreeTable"),
				sPath = "/" + oModel.createKey("Projects", {
					ID: sID
				}),
				oBC = oModel.createBindingContext(sPath),
				oSorter = new Sorter("code", false),
				sProjectCode = oBC.getProperty("code");

			this.getUserInfo("SiteCockpit", "Project_User", sProjectCode);

			sPath += "/locations";
			oList.bindRows({
				path: sPath,
				sorter: oSorter, // doesn't work; sort after binding
				parameters: {
					countMode: "Inline",
					numberOfExpandedLevels: 1,
					treeAnnotationProperties: {
						hierarchyLevelFor: "hierarchyLevel",
						hierarchyNodeFor: "nodeID",
						hierarchyParentNodeFor: "parentNodeID",
						hierarchyDrillStateFor: "drillState"
					}
				}
			});
			oList.getBinding("rows").sort(oSorter, "Application");
			// set the project as title
			sTitle = oBC.getProperty("code") + " - " + oBC.getProperty("description");
			this.getModel("masterView").setProperty("/title", sTitle);
		},

		selectProject: function () {
			this._createProjectSelectionDialog();
			this.projectSelectionDialog.open();
		},

		_createProjectSelectionDialog: function () {
			var sTitle = this.getResourceBundle().getText("selectProjectDialogTitle");

			if (!this.projectSelectionDialog) {
				this.projectSelectionDialog = new Dialog({
					title: sTitle,
					contentWidth: "50%",
					resizable: true,
					draggable: true,
					content: [
							sap.ui.xmlfragment("projectSelectFrag", "cockpit.Cockpit.view.SelectProject", this)
						]
						/*,
					buttons: [{
						text: sCancel,
						enabled: true,
						visible: true,
						press: function () {
							that.projectSelectionDialog.close();
						}
					}] */
				});
			}
			//this.projectSelectionDialog.setDraggable(true);
			this.projectSelectionDialog.addStyleClass("sapUiContentPadding");
			this.getView().addDependent(this.projectSelectionDialog);
		},

		onProjectSelected: function (oEvent) {
			var sProjectID = oEvent.getParameter("listItem").getBindingContext().getProperty("ID");

			this.projectSelectionDialog.close();
			this.getModel("appView").setProperty("/selectedProjectID", sProjectID);
			this.setProjectBC(sProjectID);
		},

		onProjectListUpdateFinished: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oList = oFrag.byId("projectSelectFrag", "projectsTable"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("masterView");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("selectProjectTitle", [iTotalItems]);
				} else {
					sTitle = this.getResourceBundle().getText("selectProjectTitleEmpty");
				}
				oViewModel.setProperty("/selectProjectTitle", sTitle);
			}
		},

		onContextMenu: function (oEvent) {
			var oTreeTable = this.byId("projectTreeTable"),
				oContextMenu = oTreeTable.getContextMenu(),
				iContextIndex = oEvent.getParameter("rowIndex"),
				aSelectedIndices = oTreeTable.getSelectedIndices(),
				aSelectedRowIDs = [];

			if (!this.getModel("masterView").getProperty("/editMode")) {
				return;
			}
			// if right click is not on a selected row then select context row
			if (!aSelectedIndices.includes(iContextIndex)) {
				// remove previous selections
				oTreeTable.setSelectedIndex(-1);
				oTreeTable.setSelectedIndex(iContextIndex);
				aSelectedRowIDs.push(oTreeTable.getContextByIndex(iContextIndex).getObject().ID);
				this.getModel("appView").setProperty("/selectedRowIDs", aSelectedRowIDs);
			}
			this.setEnableMenuItems(oContextMenu);
		},

		onLocationMenu: function (oEvent) {
			if (!this._locationMenu) {
				this._locationMenu = sap.ui.xmlfragment(
					"cockpit.Cockpit.view.LocationMenu",
					this
				);
				this.getView().addDependent(this._locationMenu);
			}
			var eDock = sap.ui.core.Popup.Dock,
				oButton = oEvent.getSource();
			this._locationMenu.open(this._bKeyboard, oButton, eDock.BeginTop, eDock.BeginBottom, oButton);
			this.setEnableMenuItems(this._locationMenu);
		},

		setEnableMenuItems: function (oMenu) {
			var aMenuItems = oMenu.getItems();

			// 0 = add, 1 = edit, 2 = delete, 3 = copy, 4 = paste
			for (var i = 0; i < aMenuItems.length; i++) {
				aMenuItems[i].setEnabled(false);
				aMenuItems[i].setVisible(true);
			}
			var oModel = this.getModel(),
				aSelectedRowIDs = this.getModel("appView").getProperty("/selectedRowIDs"),
				bExpandedSelected = false,
				bPasteMode = this.getModel("masterView").getProperty("/paste"),
				sPath = "";

			for (i = 0; i < aSelectedRowIDs.length; i++) {
				sPath = "/" + oModel.createKey("Locations", {
					ID: aSelectedRowIDs[i]
				});
				if (!bExpandedSelected) {
					bExpandedSelected = oModel.getObject(sPath).drillState === "expanded";
				} else {
					break;
				}
			}
			if (aSelectedRowIDs.length === 1) {
				aMenuItems[0].setEnabled(true);
				aMenuItems[1].setEnabled(true);
				aMenuItems[2].setEnabled(!bExpandedSelected);
				aMenuItems[3].setEnabled(!bExpandedSelected || bPasteMode);
				aMenuItems[4].setEnabled(bPasteMode);
			} else if (aSelectedRowIDs.length > 1) {
				aMenuItems[2].setEnabled(!bExpandedSelected);
				aMenuItems[3].setEnabled(!bExpandedSelected || bPasteMode);
			}
			// if tree is empty enable add
			if (!this.byId("projectTreeTable").getContextByIndex(0)) {
				this.getModel("masterView").setProperty("/noLocations", true);
				aMenuItems[0].setEnabled(true);
				this.byId("addButton").setEnabled(true);
			}
		},

		onLocationPick: function (oEvent) {
			var oTree = this.byId("projectTreeTable"),
				aSelectedIndices = oTree.getSelectedIndices(),
				aSelectedRowIDs = [],
				sID = "",
				bExpandedSelected = false;

			for (var i = 0; i < aSelectedIndices.length; i++) {
				sID = oTree.getContextByIndex(aSelectedIndices[i]).getObject().ID;
				aSelectedRowIDs.push(sID);
				if (!bExpandedSelected) { // no deletion of nodes with children supported yet
					bExpandedSelected = oTree.getContextByIndex(aSelectedIndices[i]).getObject().drillState === "expanded";
				}
			}
			this.getModel("appView").setProperty("/selectedRowIDs", aSelectedRowIDs);
			if (this.getModel("masterView").getProperty("/editMode")) {
				this.byId("addButton").setEnabled(false);
				this.byId("editButton").setEnabled(false);
				this.byId("deleteButton").setEnabled(false);
				if (aSelectedRowIDs.length === 1) {
					this.byId("addButton").setEnabled(true);
					this.byId("editButton").setEnabled(true);
					this.byId("deleteButton").setEnabled(!bExpandedSelected);
				} else if (aSelectedRowIDs.length > 1) {
					this.byId("deleteButton").setEnabled(!bExpandedSelected);
				}
			} else {
				if (aSelectedRowIDs.length === 0) {
					this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
					this.getModel("appView").setProperty("/layout", "OneColumn");
				} else {
					this._showSelectedRows();
				}
			}
		},

		onDragStart: function (oEvent) {
			var oTreeTable = this.byId("projectTreeTable");
			var oDragSession = oEvent.getParameter("dragSession");
			var oDraggedRow = oEvent.getParameter("target");
			var iDraggedRowIndex = oDraggedRow.getIndex();
			var aSelectedIndices = oTreeTable.getSelectedIndices();
			var aDraggedRowContexts = [];

			if (aSelectedIndices.length > 0) {
				// If rows are selected, do not allow to start dragging from a row which is not selected.
				if (aSelectedIndices.indexOf(iDraggedRowIndex) === -1) {
					oEvent.preventDefault();
				} else {
					for (var i = 0; i < aSelectedIndices.length; i++) {
						aDraggedRowContexts.push(oTreeTable.getContextByIndex(aSelectedIndices[i]));
					}
				}
			} else {
				aDraggedRowContexts.push(oTreeTable.getContextByIndex(iDraggedRowIndex));
			}

			oDragSession.setComplexData("hierarchymaintenance", {
				draggedRowContexts: aDraggedRowContexts
			});
		},

		onDrop: function (oEvent) {
			var oTreeTable = this.byId("projectTreeTable");
			var oDragSession = oEvent.getParameter("dragSession");
			var oDroppedRow = oEvent.getParameter("droppedControl");
			var aDraggedRowContexts = oDragSession.getComplexData("hierarchymaintenance").draggedRowContexts;
			var oNewParentContext = oTreeTable.getContextByIndex(oDroppedRow.getIndex());

			if (aDraggedRowContexts.length === 0 || !oNewParentContext) {
				return;
			}

			var oModel = this.getModel();
			var iNewParentNodeID = oNewParentContext.getObject().nodeID;
			var iNewParentHierarchyLevel = oNewParentContext.getObject().hierarchyLevel;
			var bCopy = oEvent.getParameter("copy");

			for (var i = 0; i < aDraggedRowContexts.length; i++) {
				if (oNewParentContext.getPath().indexOf(aDraggedRowContexts[i].getPath()) === 0) {
					// Avoid moving a node into one of its child nodes.
					continue;
				}
				if (bCopy) { // bCopy isn't supported on Chrome for Mac
					var oData = aDraggedRowContexts[i].getObject({ // revisit
						select: "*"
					});
				} else { // move
					oModel.setProperty("parentNodeID", iNewParentNodeID, aDraggedRowContexts[i]);
					oModel.setProperty("hierarchyLevel", iNewParentHierarchyLevel + 1, aDraggedRowContexts[i]);
				}
			}
			oModel.submitChanges();
		},

		onEdit: function () {
			var oViewModel = this.getModel("masterView"),
				bEdit = oViewModel.getProperty("/editMode"),
				oTree = this.byId("projectTreeTable"),
				aSelectedIndices = oTree.getSelectedIndices();

			oViewModel.setProperty("/editMode", !bEdit);
			this.getModel("masterView").setProperty("/mode", "None");
			if (!bEdit) {
				this.byId("addButton").setEnabled(false);
				this.byId("editButton").setEnabled(false);
				this.byId("deleteButton").setEnabled(false);
				if (aSelectedIndices.length === 1) {
					this.byId("addButton").setEnabled(true);
					this.byId("editButton").setEnabled(true);
					this.byId("deleteButton").setEnabled(true);
				} else if (!this.byId("projectTreeTable").getContextByIndex(0)) { // no data
					this.byId("addButton").setEnabled(true);
				}
				this.getModel("appView").setProperty("/layout", "OneColumn");
			} else if (aSelectedIndices.length > 0) {
				this._showSelectedRows();
			}
		},

		disableEditButtons: function () {
			this.byId("addButton").setEnabled(false);
			this.byId("editButton").setEnabled(false);
			this.byId("deleteButton").setEnabled(false);
		},

		onAddLocation: function (oEvent) {
			var oTree = this.byId("projectTreeTable"),
				aSelectedIndices = oTree.getSelectedIndices(),
				oNewParentContext = oTree.getContextByIndex(aSelectedIndices[0]), // only 1 row selected
				oModel = this.getModel(),
				oFrag = sap.ui.core.Fragment,
				oCode,
				oDescription,
				oPlannedStart,
				oPlannedEnd,
				sTitle = this.getResourceBundle().getText("createLocationTitle"),
				bInitialCreate = !oTree.getRows() || oTree.getRows().length === 0;

			this.getModel("masterView").setProperty("/mode", "Create");
			this._createLocationDialog();

			oCode = oFrag.byId("myFrag", "code");
			oDescription = oFrag.byId("myFrag", "description");
			oPlannedStart = oFrag.byId("myFrag", "plannedStart");
			oPlannedEnd = oFrag.byId("myFrag", "plannedEnd");
			oDescription.setValue("");
			if (!bInitialCreate) {
				oCode.setValue(oModel.getProperty("code", oNewParentContext));
				oPlannedStart.setDateValue(oModel.getProperty("startDate", oNewParentContext));
				oPlannedEnd.setDateValue(oModel.getProperty("endDate", oNewParentContext));
			} else {
				oCode.setValue("");
				oPlannedStart.setDateValue(new Date());
				oPlannedEnd.setDateValue(new Date());
			}
			// create button
			this.oLocationDialog.getButtons()[0].setVisible(true);
			this.oLocationDialog.getButtons()[0].setEnabled(false);
			// save, delete button
			this.oLocationDialog.getButtons()[1].setVisible(false);
			this.oLocationDialog.getButtons()[2].setVisible(false);
			this.oLocationDialog.setTitle(sTitle);
			this.oLocationDialog.open();
		},

		onEditLocation: function () { // icon Edit is pressed
			var oFrag = sap.ui.core.Fragment,
				oCode,
				oDescription,
				oPlannedStart,
				oPlannedEnd,
				oTreeTable = this.byId("projectTreeTable"),
				aSelectedIndices = oTreeTable.getSelectedIndices(),
				iLength = aSelectedIndices.length;

			if (iLength !== 1) {
				MessageToast.show("Select exactly one row");
				return;
			}

			var oLocationBC = oTreeTable.getContextByIndex(aSelectedIndices[0]),
				sCode = oLocationBC.getProperty("code"),
				sDescription = oLocationBC.getProperty("description"),
				sPlannedStart = oLocationBC.getProperty("startDate"), // actually is an object
				sPlannedEnd = oLocationBC.getProperty("endDate"),
				sTitle = this.getResourceBundle().getText("editLocationTitle");

			this.getModel("masterView").setProperty("/mode", "Edit");
			this._createLocationDialog();

			oCode = oFrag.byId("myFrag", "code");
			oDescription = oFrag.byId("myFrag", "description");
			oPlannedStart = oFrag.byId("myFrag", "plannedStart");
			oPlannedEnd = oFrag.byId("myFrag", "plannedEnd");
			oCode.setValue(sCode);
			oDescription.setValue(sDescription);
			oPlannedStart.setDateValue(sPlannedStart);
			oPlannedEnd.setDateValue(sPlannedEnd);

			// create button
			this.oLocationDialog.getButtons()[0].setVisible(false);
			// save button
			this.oLocationDialog.getButtons()[1].setVisible(true);
			this.oLocationDialog.getButtons()[1].setEnabled(false);
			// delete button
			if (oLocationBC.getProperty("drillState") === "leaf") {
				this.oLocationDialog.getButtons()[2].setVisible(true);
				this.oLocationDialog.getButtons()[2].setEnabled(true);
			} else {
				this.oLocationDialog.getButtons()[2].setVisible(false);
				this.oLocationDialog.getButtons()[2].setEnabled(false);
			}
			this.oLocationDialog.setTitle(sTitle);
			this.oLocationDialog.open();
		},

		onDeleteLocation: function () {
			var oTree = this.byId("projectTreeTable"),
				aSelectedIndices = oTree.getSelectedIndices(),
				sPath = "",
				aDeleteIDs = [],
				sConfirmText = this.getResourceBundle().getText("locationDialogConfirmDeleteText"),
				sConfirmTitle = this.getResourceBundle().getText("locationDialogConfirmDeleteTitle"),
				that = this;
			/*
						///////test finding crew clashes
						var oModel = this.getModel(),
							aCrews,
							aTasksOfCrew = [],
							i, j, k,
							aOverlappingTasksOfAllCrews = [],
							iStart1,
							iStart2,
							iEnd1,
							iEnd2,
							oTask1, oTask2,
							findMirroredTaskIndex = function (oTask) {
								if (oTask.task1.name !== oTask2.name) {
									return false;
								}
								if (oTask.task1.number !== oTask2.number) {
									return false;
								}
								if (oTask.task1.start.getTime() !== oTask2.start.getTime()) {
									return false;
								}
								if (oTask.task1.end.getTime() !== oTask2.end.getTime()) {
									return false;
								}
								if (oTask.task1.locationCode !== oTask2.locationCode) {
									return false;
								}
								if (oTask.task1.locationDescription !== oTask2.locationDescription) {
									return false;
								}
								if (oTask.task2.name !== oTask1.name) {
									return false;
								}
								if (oTask.task2.number !== oTask1.number) {
									return false;
								}
								if (oTask.task2.start.getTime() !== oTask1.start.getTime()) {
									return false;
								}
								if (oTask.task2.end.getTime() !== oTask1.end.getTime()) {
									return false;
								}
								if (oTask.task2.locationCode !== oTask1.locationCode) {
									return false;
								}
								if (oTask.task2.locationDescription !== oTask1.locationDescription) {
									return false;
								}
								return true;
							},
							fOverlappingTasksOfCrew = function (oCrew, aAllTasks) {
								return aAllTasks.reduce(function (aOverlappingTasksOfOneCrew, oTask) {
									for (k = 0; k < aAllTasks.length; k++) {
										if (oTask.ID !== aAllTasks[k].ID) {
											if (oTask.status < 2) { // not yet started
												iStart1 = oTask.plannedStart.getTime();
											} else {
												iStart1 = oTask.actualStart.getTime();
											}
											if (aAllTasks[k].status < 2) { // not yet started
												iStart2 = aAllTasks[k].plannedStart.getTime();
											} else {
												iStart2 = aAllTasks[k].actualStart.getTime();
											}
											iEnd1 = oTask.estimatedEnd.getTime();
											iEnd2 = aAllTasks[k].estimatedEnd.getTime();
											// now check if overlapping
											if (iStart1 < iEnd2 && iStart2 < iEnd1) {
												oTask1 = {
													name: oTask.taskName,
													number: oTask.number,
													description: oTask.shortText,
													start: new Date(iStart1),
													end: new Date(iEnd1),
													locationCode: oTask.location.code,
													locationDescription: oTask.location.description
												};
												oTask2 = {
													name: aAllTasks[k].taskName,
													number: aAllTasks[k].number,
													description: aAllTasks[k].shortText,
													start: new Date(iStart2),
													end: new Date(iEnd2),
													locationCode: aAllTasks[k].location.code,
													locationDescription: aAllTasks[k].location.description
												};
												if (aOverlappingTasksOfOneCrew.findIndex(findMirroredTaskIndex) < 0) { // no mirrored duplicate
													aOverlappingTasksOfOneCrew.push({
														crewName: oCrew.crewName,
														crewNumber: oCrew.crewNumber,
														task1: oTask1,
														task2: oTask2
													});
												}
											}
										}
									}
									return aOverlappingTasksOfOneCrew;
								}, []);
							};

						oModel.read("/Crews", {
							filters: [new Filter("project_ID", FilterOperator.EQ, this.getModel("appView").getProperty("/selectedProjectID"))],
							urlParameters: {
								$inlinecount: "allpages",
								$expand: "tasks, tasks/task, tasks/task/location"
							},
							success: function (oData) {
								aCrews = oData.results;
								for (i = 0; i < aCrews.length; i++) { // fish task array for crew
									aTasksOfCrew = [];
									for (j = 0; j < aCrews[i].tasks.results.length; j++) {
										aTasksOfCrew.push(aCrews[i].tasks.results[j].task);
									}
									aOverlappingTasksOfAllCrews = aOverlappingTasksOfAllCrews.concat(fOverlappingTasksOfCrew(aCrews[i], aTasksOfCrew));
								}
							}
						});
						// end test
			*/
			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
					initialFocus: MessageBox.Action.CANCEL,
					onClose: function (sAction) {
						if (sAction === "OK") {
							for (var i = 0; i < aSelectedIndices.length; i++) {
								sPath = oTree.getContextByIndex(aSelectedIndices[i]).getPath();
								aDeleteIDs.push(sPath.slice(sPath.indexOf("'") + 1, sPath.indexOf(")") - 1));
							}
							that.deleteLocationAndDependents(aDeleteIDs);
							that.disableEditButtons();
							that.getModel("appView").setProperty("/selectedRowIDs", []); // all selections are gone
						}
					}
				}
			);
		},

		onCopyLocation: function (oEvent) {
			var oTree = this.byId("projectTreeTable"),
				aSelectedIndices = oTree.getSelectedIndices();

			this.getModel("masterView").setProperty("/mode", "copy");
			this.getModel("masterView").setProperty("/paste", true);
			this.getModel("masterView").setProperty("/copiedRowIndices", aSelectedIndices);
			// workaround to remove selections
			oTree.setSelectionInterval(0, aSelectedIndices.length - 1);
			oTree.removeSelectionInterval(0, aSelectedIndices.length - 1);

		},

		onPasteLocation: function (oEvent) {
			var oTree = this.byId("projectTreeTable"),
				aSelectedIndices = oTree.getSelectedIndices(),
				oParentContext = oTree.getContextByIndex(aSelectedIndices[0]),
				oParentLocation = oParentContext.getObject(),
				// selections were removed on copy; get them from the masterView
				aCopiedLocationIndices = this.getModel("masterView").getProperty("/copiedRowIndices"),
				oModel = this.getModel(),
				oLocation,
				iNextNodeID,
				sCodeToReplace,
				sCodeToInject,
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID");

			//this.getModel("masterView").setProperty("/mode", "none"); leave mode for multiple pastes
			this._nextNodeID().then(function (iNewNodeID) {
				for (var i = 0; i < aCopiedLocationIndices.length; i++) {
					iNextNodeID = iNewNodeID + i;
					oLocation = oTree.getContextByIndex(aCopiedLocationIndices[i]).getObject();
					sCodeToReplace = oLocation.code.slice(0, oParentLocation.code.length);
					sCodeToInject = oParentLocation.code.slice(0, sCodeToReplace.length);
					oModel.createEntry("/Locations", {
						properties: {
							ID: undefined,
							project_ID: sProjectID,
							// replace from the pasted location the first characters of the code with the parent code
							code: oLocation.code.replace(sCodeToReplace, sCodeToInject),
							description: oLocation.description,
							startDate: oParentLocation.startDate,
							endDate: oParentLocation.endDate,
							parentNodeID: oParentLocation.nodeID,
							hierarchyLevel: oParentLocation.hierarchyLevel + 1,
							nodeID: iNextNodeID,
							drillState: "leaf"
						}
					});
				}
				oModel.setProperty("drillState", "expanded", oParentContext);
				oModel.submitChanges();
			});
			this.getModel("masterView").setProperty("/copiedRowIndices", []);
			this.onLocationPick(); // sets the button enablement
		},

		handleAddLocationChange: function () {
			var oFrag = sap.ui.core.Fragment,
				aButtons = this.oLocationDialog.getButtons(), // 0..3: create, save, delete, cancel
				sCode = oFrag.byId("myFrag", "code").getValue(),
				sDescription = oFrag.byId("myFrag", "description").getValue(),
				oPlannedStart = oFrag.byId("myFrag", "plannedStart"),
				sPlannedStart = oPlannedStart.getDateValue(),
				oPlannedEnd = oFrag.byId("myFrag", "plannedEnd"),
				sPlannedEnd = oPlannedEnd.getDateValue(),
				bSave = true,
				bCreate = false,
				bDelete = false,
				oTreeTable = this.byId("projectTreeTable"),
				oLocationBC = oTreeTable.getContextByIndex(oTreeTable.getSelectedIndices()[0]);

			aButtons[0].setEnabled(false);
			aButtons[1].setEnabled(false);
			// delete only enabled if it is not a parent ode
			if (this.getModel("masterView").getProperty("/mode") === "Edit") {
				bDelete = oLocationBC.getProperty("drillState") === "leaf";
			}
			// check for required
			if (sCode === "" || sDescription === "") {
				return;
			}
			// check for errors
			if (!oPlannedStart.isValidValue()) {
				oPlannedStart.setValueState("Error");
				bSave = false;
			}
			if (!oPlannedEnd.isValidValue()) {
				oPlannedEnd.setValueState("Error");
				bSave = false;
			}
			if (this.getModel("masterView").getProperty("/mode") === "Edit") { // check for changes
				if (sCode === oLocationBC.getProperty("code") && sDescription === oLocationBC.getProperty("description") &&
					sPlannedStart === oLocationBC.getProperty("startDate") && sPlannedEnd === oLocationBC.getProperty("endDate")) {
					bSave = false;
				}
			} else { // create mode
				bCreate = true;
			}
			aButtons[0].setEnabled(bCreate);
			aButtons[1].setEnabled(bSave);
			aButtons[2].setEnabled(bDelete);
		},

		_createLocationDialog: function () {
			// oLocationBC is the current location on edit, the parent location on create
			var oFrag = sap.ui.core.Fragment,
				sCode,
				sDescription,
				oPlannedStart,
				oPlannedEnd,
				oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sCreate = this.getResourceBundle().getText("locationDialogCreateButtonText"),
				sCancel = this.getResourceBundle().getText("locationDialogCancelButtonText"),
				sDelete = this.getResourceBundle().getText("locationDialogDeleteButtonText"),
				sSave = this.getResourceBundle().getText("locationDialogSaveButtonText"),
				sConfirmText = this.getResourceBundle().getText("locationDialogConfirmDeleteText"),
				sConfirmTitle = this.getResourceBundle().getText("locationDialogConfirmDeleteTitle"),
				oTreeTable = this.byId("projectTreeTable"),
				that = this,
				bPressed = false;

			if (!this.oLocationDialog) {
				this.oLocationDialog = new Dialog({
					title: "",
					content: [
						sap.ui.xmlfragment("myFrag", "cockpit.Cockpit.view.AddLocation", this)
					],
					buttons: [{
						text: sCreate,
						enabled: false,
						visible: false,
						press: function () {
							var aSelectedIndices = oTreeTable.getSelectedIndices(),
								oNewParentContext = oTreeTable.getContextByIndex(aSelectedIndices[0]),
								mHierarchyLevel = 0,
								mParentNodeID = null;
							if (oNewParentContext) {
								mParentNodeID = oModel.getProperty("nodeID", oNewParentContext);
								mHierarchyLevel = oModel.getProperty("hierarchyLevel", oNewParentContext) + 1;
							}
							sCode = oFrag.byId("myFrag", "code").getValue();
							sDescription = oFrag.byId("myFrag", "description").getValue();
							oPlannedStart = oFrag.byId("myFrag", "plannedStart").getDateValue();
							oPlannedStart = that.adjustUTC(oPlannedStart);
							oPlannedEnd = oFrag.byId("myFrag", "plannedEnd").getDateValue();
							oPlannedEnd = that.adjustUTC(oPlannedEnd);
							if (!bPressed) {
								/*that._isCodeUnique(sCode)
									.then(function (bCodeUnique) {
										if (!bCodeUnique) { revisit: needs to be embedded in try/catch
											throw new Error(["Code is not unique"]);
										}
										return that._nextNodeID();
									})*/
								bPressed = true; // press event is fired twice! prevent from creating multiple entities
								that._nextNodeID().then(function (iNewNodeID) {
									oModel.createEntry("/Locations", {
										properties: {
											project_ID: sProjectID,
											code: sCode,
											description: sDescription,
											startDate: oPlannedStart,
											endDate: oPlannedEnd,
											parentNodeID: mParentNodeID,
											hierarchyLevel: mHierarchyLevel,
											nodeID: iNewNodeID,
											drillState: "leaf"
										}
									});
									if (oNewParentContext) {
										// parent node now has a child
										oModel.setProperty("drillState", "expanded", oNewParentContext);
									}
									oModel.submitChanges({
										success: function () {
											bPressed = false; // workaround as press event is fired twice
										}
									});
									that.oLocationDialog.close();
								});
							}
						}
					}, {
						text: sSave,
						enabled: false,
						visible: false,
						press: function () {
							var aSelectedIndices = oTreeTable.getSelectedIndices(),
								oLocationBC = oTreeTable.getContextByIndex(aSelectedIndices[0]);
							if (oLocationBC) { // press event is called twice; second time without selection
								sCode = oFrag.byId("myFrag", "code").getValue();
								sDescription = oFrag.byId("myFrag", "description").getValue();
								oPlannedStart = oFrag.byId("myFrag", "plannedStart").getDateValue();
								oPlannedStart = that.adjustUTC(oPlannedStart);
								oPlannedEnd = oFrag.byId("myFrag", "plannedEnd").getDateValue();
								oPlannedEnd = that.adjustUTC(oPlannedEnd);
								// if code was changed, check uniqueness
								if (sCode !== oModel.getProperty("code", oLocationBC)) {
									that._isCodeUnique(sCode).then(function (bCodeUnique) {
										if (!bCodeUnique) {
											MessageBox.information(that.getResourceBundle().getText("messageCodeNotUnique"));
										} else {
											oModel.setProperty("code", sCode, oLocationBC);
											oModel.setProperty("description", sDescription, oLocationBC);
											oModel.setProperty("startDate", oPlannedStart, oLocationBC);
											oModel.setProperty("endDate", oPlannedEnd, oLocationBC);
											oModel.submitChanges();
										}
									});
								} else {
									// oModel.setProperty("code", sCode, oLocationBC);
									oModel.setProperty("description", sDescription, oLocationBC);
									oModel.setProperty("startDate", oPlannedStart, oLocationBC);
									oModel.setProperty("endDate", oPlannedEnd, oLocationBC);
									oModel.submitChanges();
								}
								that.oLocationDialog.close();
							} else { // control unselected
								that.disableEditButtons();
							}
						}
					}, {
						text: sDelete,
						enabled: false,
						visible: false,
						press: function () {
							var aSelectedIndices = oTreeTable.getSelectedIndices(),
								oLocationBC = oTreeTable.getContextByIndex(aSelectedIndices[0]);
							MessageBox.confirm(
								sConfirmText, {
									icon: MessageBox.Icon.WARNING,
									title: sConfirmTitle,
									actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
									initialFocus: MessageBox.Action.CANCEL,
									onClose: function (sAction) {
										if (sAction === "OK") {
											that.deleteLocationAndDependents([oLocationBC.getObject().ID]);
											that.disableEditButtons();
											that.getModel("appView").setProperty("/selectedRowIDs", []); // must be unselected
										}
									}
								}
							);
							that.oLocationDialog.close();
						}
					}, {
						text: sCancel,
						enabled: true,
						visible: true,
						press: function () {
							that.oLocationDialog.close();
						}
					}]
				});
			}
			this.oLocationDialog.setDraggable(true);
			this.oLocationDialog.addStyleClass("sapUiContentPadding");
			this.getView().addDependent(this.oLocationDialog);
		},

		/**
		 * Event handler for the master search field. Applies current
		 * filter value and triggers a new search. If the search field's
		 * 'refresh' button has been pressed, no new search is triggered
		 * and the list binding is refresh instead.
		 * @param {sap.ui.base.Event} oEvent the search event
		 * @public
		 */
		onSearch: function (oEvent) {
			if (oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.onRefresh();
				return;
			}

			var sQuery = oEvent.getParameter("query");

			if (sQuery) {
				this._oListFilterState.aSearch = [new Filter("code", FilterOperator.Contains, sQuery)];
			} else {
				this._oListFilterState.aSearch = [];
			}
			this._applyFilterSearch();

		},

		/**
		 * Event handler for refresh event. Keeps filter, sort
		 * and group settings and refreshes the list binding.
		 * @public
		 */
		onRefresh: function () {
			this._oList.getBinding("items").refresh();
		},

		/**
		 * Event handler for the filter, sort and group buttons to open the ViewSettingsDialog.
		 * @param {sap.ui.base.Event} oEvent the button press event
		 * @public
		 */
		onOpenViewSettings: function (oEvent) {
			var sDialogTab = "filter";
			if (oEvent.getSource() instanceof sap.m.Button) {
				var sButtonId = oEvent.getSource().getId();
				if (sButtonId.match("sort")) {
					sDialogTab = "sort";
				} else if (sButtonId.match("group")) {
					sDialogTab = "group";
				}
			}
			// load asynchronous XML fragment
			if (!this.byId("viewSettingsDialog")) {
				Fragment.load({
					id: this.getView().getId(),
					name: "cockpit.Cockpit.view.ViewSettingsDialog",
					controller: this
				}).then(function (oDialog) {
					// connect dialog to the root view of this component (models, lifecycle)
					this.getView().addDependent(oDialog);
					oDialog.addStyleClass(this.getOwnerComponent().getContentDensityClass());
					oDialog.open(sDialogTab);
				}.bind(this));
			} else {
				this.byId("viewSettingsDialog").open(sDialogTab);
			}
		},

		/**
		 * Event handler called when ViewSettingsDialog has been confirmed, i.e.
		 * has been closed with 'OK'. In the case, the currently chosen filters, sorters or groupers
		 * are applied to the master list, which can also mean that they
		 * are removed from the master list, in case they are
		 * removed in the ViewSettingsDialog.
		 * @param {sap.ui.base.Event} oEvent the confirm event
		 * @public
		 */
		onConfirmViewSettingsDialog: function (oEvent) {

			this._applySortGroup(oEvent);
		},

		/**
		 * Apply the chosen sorter and grouper to the master list
		 * @param {sap.ui.base.Event} oEvent the confirm event
		 * @private
		 */
		_applySortGroup: function (oEvent) {
			var mParams = oEvent.getParameters(),
				sPath,
				bDescending,
				aSorters = [];
			sPath = mParams.sortItem.getKey();
			bDescending = mParams.sortDescending;
			aSorters.push(new Sorter(sPath, bDescending));
			this._oList.getBinding("items").sort(aSorters);
		},

		/**
		 * Used to create GroupHeaders with non-capitalized caption.
		 * These headers are inserted into the master list to
		 * group the master list's items.
		 * @param {Object} oGroup group whose text is to be displayed
		 * @public
		 * @returns {sap.m.GroupHeaderListItem} group header with non-capitalized caption.
		 */
		createGroupHeader: function (oGroup) {
			return new GroupHeaderListItem({
				title: oGroup.text,
				upperCase: false
			});
		},

		/**
		 * Event handler for navigating back.
		 * It there is a history entry or an previous app-to-app navigation we go one step back in the browser history
		 * If not, it will navigate to the shell home
		 * @public
		 */
		onNavBack: function () {
			var sPreviousHash = History.getInstance().getPreviousHash(),
				oCrossAppNavigator = sap.ushell.Container.getService("CrossApplicationNavigation");

			if (sPreviousHash !== undefined || !oCrossAppNavigator.isInitialNavigation()) {
				// eslint-disable-next-line sap-no-history-manipulation
				history.go(-1);
			} else {
				oCrossAppNavigator.toExternal({
					target: {
						shellHash: "#Shell-home"
					}
				});
			}
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		_createViewModel: function () {
			return new JSONModel({
				isFilterBarVisible: false,
				filterBarLabel: "",
				delay: 0,
				title: "",
				noDataText: this.getResourceBundle().getText("masterListNoDataText"),
				sortBy: "code",
				groupBy: "None",
				editMode: false, // the mode of the tree list
				mode: "None", // the mode of edit (edit, create or copy)
				paste: false, // if true then copy was pressed before
				noLocations: false,
				copiedRowIndices: [],
				selectProjectTitle: ""
			});
		},

		_onMasterMatched: function () {
			//Set the layout property of the FCL control to 'OneColumn'
			this.getModel("appView").setProperty("/layout", "OneColumn");
		},

		/**
		 * Shows the selected rows on the detail page
		 */
		_showSelectedRows: function () {
			//var mNoOfSelectedRows = this.getModel("appView").getProperty("/selectedRowIDs").length;
			var mNoOfSelectedRows = this.byId("projectTreeTable").getSelectedIndices().length;

			if (mNoOfSelectedRows === 0) {
				return;
			}
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getRouter().navTo("object", {
				no: mNoOfSelectedRows
			}, true);

		},

		_isCodeUnique: function (sCode) {
			var oModel = this.getModel(),
				sPath = "/Locations",
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				aFilter = [
					new Filter({
						path: "code",
						operator: sap.ui.model.FilterOperator.EQ,
						value1: sCode
					}),
					new Filter({
						path: "project_ID",
						operator: sap.ui.model.FilterOperator.EQ,
						value1: sProjectID
					})
				];

			return new Promise(function (resolve, reject) {
				oModel.read(sPath, {
					urlParameters: {
						$inlinecount: "allpages",
						$top: 1
					},
					filters: aFilter,
					and: true,
					success: function (oData) {
						if (oData.results.length > 0) {
							resolve(false);
						} else {
							resolve(true);
						}
					},
					error: function () {
						resolve(false);
					}
				});
			});
		},

		_nextNodeID: function () {
			var oModel = this.getModel(),
				sPath = "/Locations",
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				aFilter = [
					new Filter({
						path: "project_ID",
						operator: sap.ui.model.FilterOperator.EQ,
						value1: sProjectID
					})
				],
				aSorter = [new Sorter({
					path: "nodeID",
					descending: true
				})];

			return new Promise(function (resolve, reject) {
				oModel.read(sPath, {
					urlParameters: {
						$inlinecount: "allpages",
						$top: 1
					},
					filters: aFilter,
					sorters: aSorter,
					success: function (oData) {
						if (oData.results.length > 0) {
							resolve(oData.results[0].nodeID + 1);
						} else {
							resolve(1); // first item to be created
						}
					},
					error: function () {
						resolve(1); // assumed not found error
					}
				});
			});
		},

		/**
		 * Internal helper method to apply both filter and search state together on the list binding
		 * @private
		 */
		_applyFilterSearch: function () {
			var aFilters = this._oListFilterState.aSearch.concat(this._oListFilterState.aFilter),
				oViewModel = this.getModel("masterView");
			this._oList.getBinding("items").filter(aFilters, "Application");
			// changes the noDataText of the list in case there are no filter results
			if (aFilters.length !== 0) {
				oViewModel.setProperty("/noDataText", this.getResourceBundle().getText("masterListNoDataWithFilterOrSearchText"));
			} else if (this._oListFilterState.aSearch.length > 0) {
				// only reset the no data text to default when no new search was triggered
				oViewModel.setProperty("/noDataText", this.getResourceBundle().getText("masterListNoDataText"));
			}
		},

		/**
		 * Internal helper method that sets the filter bar visibility property and the label's caption to be shown
		 * @param {string} sFilterBarText the selected filter value
		 * @private
		 */
		_updateFilterBar: function (sFilterBarText) {
			var oViewModel = this.getModel("masterView");
			oViewModel.setProperty("/isFilterBarVisible", (this._oListFilterState.aFilter.length > 0));
			oViewModel.setProperty("/filterBarLabel", this.getResourceBundle().getText("masterFilterBarText", [sFilterBarText]));
		}

	});

});