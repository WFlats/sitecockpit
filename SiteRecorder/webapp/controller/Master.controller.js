sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/routing/History",
	"sap/ui/model/Filter",
	"sap/ui/model/Sorter",
	"sap/ui/model/FilterOperator",
	"sap/m/GroupHeaderListItem",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"sap/m/Dialog",
	"sap/ui/Device",
	"sap/base/Log",
	"sap/ui/core/Fragment",
	"../model/formatter"
], function (BaseController, JSONModel, History, Filter, Sorter, FilterOperator, GroupHeaderListItem, MessageToast, MessageBox, Dialog,
	Device, Log, Fragment, formatter) {
	"use strict";

	return BaseController.extend("site.recorder.SiteRecorder.controller.Master", {

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
			var oList = this.byId("list"),
				oViewModel = this._createViewModel(),
				// Put down master list's original value for busy indicator delay,
				// so it can be restored later on. Busy handling on the master list is
				// taken care of by the master list itself.
				iOriginalBusyDelay = oList.getBusyIndicatorDelay();

			this._oList = oList;
			// filter tasks started or stopped only
			this._oListFilterState = {
				aFilter: [new Filter({
					path: "status",
					operator: FilterOperator.BT,
					value1: 0,
					value2: 4
				})],
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

			this.getView().addEventDelegate({
				onBeforeFirstShow: function () {
					this.getOwnerComponent().oListSelector.setBoundMasterList(oList);
				}.bind(this)
			});

			// find to which project(s) the user has access
			// if more than one, let the user select
			var oModel = this.getOwnerComponent().getModel(),
				oAppView = this.getModel("appView"),
				that = this;
			oModel.metadataLoaded().then(function () {
				oModel.read("/Projects", {
					success: function (oData) {
						if (oData && oData.results.length > 0) {
							if (oData.results.length === 1) {
								oAppView.setProperty("/selectedProjectID", oData.results[0].ID);
								that.setProject(oData.results[0].ID);
							} else {
								that.selectProject(); // sets bidingContext, appView
							}
						} else {
							MessageBox.Alert("You have no access rights to projects!");
							that.navBack();
						}
					},
					error: function (oResult) {
						MessageBox.Alert("Error accessing projects: " + oResult.statusCode + " - " + oResult.statusText);
						that.navBack();
					}
				});
			});

			this.getRouter().getRoute("master").attachPatternMatched(this._onMasterMatched, this);
			this.getRouter().attachBypassed(this.onBypassed, this);
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		setProject: function (sID) {
			var oModel = this.getModel(),
				sTitle,
				sPath = "/" + oModel.createKey("Projects", {
					ID: sID
				}),
				oBC = oModel.createBindingContext(sPath),
				that = this;

			this._oListFilterState.aFilter.push(new Filter("project_ID", sap.ui.model.FilterOperator.EQ, sID));
			//this._applyFilterSearch();
			// set the project as title
			sTitle = oBC.getProperty("code") + " - " + oBC.getProperty("description");
			this.getModel("masterView").setProperty("/title", sTitle);

			// getUserInfo also checks if the user is a foreman/supervisor and then filters his assigned tasks only
			this.getUserInfo("SiteRecorder", "Foreman", oBC.getProperty("code"), sID);

			var oWorkTimeModel = this.getModel("workTimeModel");
			if (!oWorkTimeModel || oWorkTimeModel.getProperty("/shifts").length === 0) {
				this._loadShifts(sID).then(function (oWorkTimes) {
					if (oWorkTimes.shifts.length === 0) {
						var sText = "Error: Worktime model not loaded correctly";
						MessageBox.error(sText, {
							icon: MessageBox.Icon.ERROR,
							title: "Work Time Model Error",
							actions: [sap.m.MessageBox.Action.OK],
							onClose: function (sAction) {
								that.navBack();
							}
						});
					}
					that.getModel("masterView").setProperty("/busy", false);
				});
			} else {
				this.getModel("masterView").setProperty("/busy", false);
			}
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
						sap.ui.xmlfragment("projectSelectFrag", "site.recorder.SiteRecorder.view.SelectProject", this)
					]
				});
			}
			this.projectSelectionDialog.addStyleClass("sapUiContentPadding");
			this.getView().addDependent(this.projectSelectionDialog);
		},

		onProjectSelected: function (oEvent) {
			var sProjectID = oEvent.getParameter("listItem").getBindingContext().getProperty("ID");

			this.projectSelectionDialog.close();
			this.getModel("appView").setProperty("/selectedProjectID", sProjectID);
			this.setProject(sProjectID);
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

		/**
		 * After list data is available, this handler method updates the
		 * master list counter
		 * @param {sap.ui.base.Event} oEvent the update finished event
		 * @public
		 */
		onUpdateFinished: function (oEvent) {
			// update the master list object counter after new data is loaded
			this._updateListItemCount(oEvent.getParameter("total"));
		},

		onFilterToggle: function () {
			if (!this.getModel("masterView").getProperty("/isFilterBarVisible")) {
				this._oListFilterState.aSearch = [];
				this._oListFilterState.aFilter[0] = new Filter("status", FilterOperator.BT, 0, 4);
				this._applyFilterSearch();
				this.byId("searchField").setValue("");
				this.byId("statusSelect").setSelectedItem(null);
				this.getModel("appView").setProperty("/layout", "OneColumn");
			}
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
				this._oListFilterState.aSearch = [new Filter("shortText", FilterOperator.Contains, sQuery)];
				this.getModel("appView").setProperty("/layout", "OneColumn");
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

		onSelectionChange: function (oEvent) {
			var oList = oEvent.getSource(),
				bSelected = oEvent.getParameter("selected");

			// skip navigation when deselecting an item in multi selection mode
			if (!(oList.getMode() === "MultiSelect" && !bSelected)) {
				// get the list item, either from the listItem parameter or from the event's source itself (will depend on the device-dependent mode).
				this._showDetail(oEvent.getParameter("listItem") || oEvent.getSource());
			}
		},

		/**
		 * Event handler for the bypassed event, which is fired when no routing pattern matched.
		 * If there was an object selected in the master list, that selection is removed.
		 * @public
		 */
		onBypassed: function () {
			this._oList.removeSelections(true);
		},

		getLocation: function (oContext) {
			var oLocation = oContext.getProperty("location"),
				oGroup;
			if (oLocation) {
				oGroup = {
					key: oLocation.code,
					description: oLocation.description
				};
			}
			return oGroup;
		},

		createGroupHeader: function (oGroup) {
			var sText = oGroup.key + " " + oGroup.description;
			return new GroupHeaderListItem({
				title: sText,
				upperCase: false
			});
		},

		onSwipe: function (evt) { // register swipe event
			var oSwipeContent = evt.getParameter("swipeContent"), // get swiped content from event
				oSwipeDirection = evt.getParameter("swipeDirection"), // get swiped direction from event
				oListItem = evt.getParameter("listItem"),
				sButtonText,
				sButtonType,
				mStatus = oListItem.getBindingContext().getObject().status,
				oStartDate = oListItem.getBindingContext().getObject().actualStart;

			sButtonText = "";
			sButtonType = "Transparent";
			oSwipeContent.setText(sButtonText).setType(sButtonType);
			if (oStartDate && oStartDate > new Date()) {
				MessageToast.show(this.getResourceBundle().getText("errorMeasurementBeforeStartDate"));
				return;
			}
			if (oSwipeDirection === "EndToBegin" && mStatus === 2) {
				sButtonText = this.getResourceBundle().getText("stopButtonText");
				sButtonType = "Negative";
			} else {
				switch (mStatus) {
				case 0: // planned
					sButtonText = this.getResourceBundle().getText("commitButtonText");
					sButtonType = "Accept";
					break;
				case 1: // committed
					sButtonText = this.getResourceBundle().getText("startButtonText");
					sButtonType = "Success";
					break;
				case 2: // started
					sButtonText = this.getResourceBundle().getText("completeButtonText");
					sButtonType = "Accept";
					break;
				case 3: // stopped
					sButtonText = this.getResourceBundle().getText("restartButtonText");
					sButtonType = "Success";
					break;
				case 4: // completed
					sButtonText = this.getResourceBundle().getText("approveButtonText");
					sButtonType = "Emphasized";
					break;
				default:
					sButtonText = "";
					sButtonType = "Transparent";
				}
			}
			oSwipeContent.setText(sButtonText).setType(sButtonType);
		},

		onSwipeButtonPressed: function (evt) {
			var oList = evt.getSource().getParent(),
				oListItem = oList.getSwipedItem(),
				oModel = this.getModel(),
				sPath = oListItem.getBindingContext().getPath(),
				oBC = oModel.createBindingContext(sPath),
				oTask = oBC.getObject({
					select: "*"
				}),
				mStatus = oTask.status,
				oShift = this.getShiftFromID(oTask.shift_ID),
				oSwipeButton = this.byId("swipeButton"),
				that = this,
				oNow = new Date(),
				sAlertMsg,
				bAbort;

			// if something went wrong
			if (oSwipeButton.getType() === "Transparent") {
				oList.swipeOut();
				return;
			}
			// check if a previous task was not completed
			if (mStatus === 1) { // attempt to start
				this.getPreviousTask(oTask).then(function (oPreviousTask) {
					if (oPreviousTask && oPreviousTask.status < 4) {
						sAlertMsg = that.getResourceBundle().getText("previousTaskNotCompleted", [oPreviousTask.taskName + " (" + oPreviousTask.number +
							")"
						]);
						bAbort = true;
						sap.m.MessageBox.alert(sAlertMsg);
					}
					if (bAbort) {
						oList.swipeOut();
					} else {
						oTask.status = 2;
						oTask.actualStart = that.getStartDateInWorkingHours(new Date(), oShift);
						oTask.estimatedEnd = that.getEndDateInWorkingHours(oTask.actualStart, oTask.quantity, oTask.plannedProductivity *
							oTask.productivityFactor, oShift);
						oModel.update(sPath, oTask);
						oList.swipeOut();
					}
				});
				return;
			} else {
				switch (mStatus) {
				case 0:
					oTask.status = 1;
					break;
					/*			case 1:
									oTask.status = 2;
									oTask.actualStart = this.getStartDateInWorkingHours(new Date(), oShift);
									oTask.estimatedEnd = this.getEndDateInWorkingHours(oTask.actualStart, oTask.quantity, oTask.plannedProductivity *
										oTask.productivityFactor, oShift);
									break; */
				case 2:
					if (oSwipeButton.getType() === "Negative") { // task shall be stopped
						// if oNow is not in shift, set oTask.stoppedAt to the last shift end
						if (!this.inShift(oNow, oShift)) {
							oTask.stoppedAt = this.getShiftEnd(oNow, oShift);
						} else {
							oTask.stoppedAt = oNow;
						}
						oTask.status = 3;
						break;
					} else { // set to completed
						oTask.status = 4;
						oTask.estimatedEnd = new Date();
						if (!that.inShift(oTask.estimatedEnd, oShift)) {
							oTask.estimatedEnd = that.getPreviousShiftEnd(oTask.estimatedEnd, oShift);
						}
						// checkAutoCompleteMeasurements creates final measurement, saves results to recipe and updates oTask
						this.checkAutoCompleteMeasurements(oTask);
						//this.createWorkerTimeSheets(oTask); // now in timesheet app
						oList.swipeOut();
						return;
					}
				case 3: // Restart the task
					// if oNow is not in the shift, getNetDurationHoursFromDates calculates stop duration until last shift end
					var sStopDurationHours = this.getNetDurationHoursFromDates(oTask.stoppedAt, oNow, oShift),
						iStopDurationMs = parseInt(sStopDurationHours * 3600000, 10);
					if (!oTask.stopDuration) { // first time stopped
						oTask.stopDuration = iStopDurationMs;
					} else {
						oTask.stopDuration += iStopDurationMs;
					}
					oTask.status = 2;
					this._getCumulativeQuantity(sPath).then(function (sCumulativeQuantity) {
						oTask.estimatedEnd = that.getEndDateInWorkingHours(oNow, oTask.quantity - sCumulativeQuantity, oTask.currentProductivity,
							oShift);
					});
					break;
				case 4:
					oTask.status = 5;
					//oList gets refreshed
					break;
				default:
					Log.error("Unknown task status");
					return;
				}
				oModel.update(sPath, oTask, {
					error: function (oError) {
						Log.error("Error updating task status: " + JSON.stringify(oError));
					}
				});
				oList.swipeOut();
			}
		},

		_getCumulativeQuantity: function (sTaskPath) {
			var oModel = this.getModel(),
				aSorter = [new Sorter({
					path: "measurementDateTime",
					descending: true
				})];

			return new Promise(function (resolve) {
				oModel.read(sTaskPath + "/measurements", {
					urlParameters: {
						$top: 1
					},
					sorters: aSorter,
					success: function (oData) {
						if (oData && oData.results.length > 0) {
							resolve(Number(oData.results[0].measurementQuantity));
						} else {
							resolve(0);
						}
					},
					error: function (oError) {
						resolve(0);
					}
				});
			});
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		_createViewModel: function () {
			return new JSONModel({
				isFilterBarVisible: false,
				isMyTasks: false,
				filterBarLabel: "",
				delay: 0,
				title: "",
				listTitle: "",
				selectProjectTitle: "",
				noDataText: this.getResourceBundle().getText("masterListNoDataText"),
				sortBy: "shortText",
				groupBy: "None"
			});
		},

		_onMasterMatched: function () {
			//Set the layout property of the FCL control to 'OneColumn'
			this.getModel("appView").setProperty("/layout", "OneColumn");
			this.getModel("masterView").setProperty("/busy", false);
		},

		/**
		 * Shows the selected item on the detail page
		 * On phones a additional history entry is created
		 * @param {sap.m.ObjectListItem} oItem selected Item
		 * @private
		 */
		_showDetail: function (oItem) {
			var bReplace = !Device.system.phone;

			// set the layout property of FCL control to show two columns
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getRouter().navTo("object", {
				objectId: oItem.getBindingContext().getProperty("ID")
			}, bReplace);
		},

		/**
		 * Sets the item count on the master list header
		 * @param {integer} iTotalItems the total number of items in the list
		 * @private
		 */
		_updateListItemCount: function (iTotalItems) {
			var sTitle;
			// only update the counter if the length is final
			if (this._oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("masterTitleCount", [iTotalItems]);
				this.getModel("masterView").setProperty("/listTitle", sTitle);
			}
		},

		handleStatusFilter: function (oEvent) {
			var sKey = oEvent.getParameter("selectedItem").getProperty("key");

			if (sKey === "Any") {
				this._oListFilterState.aFilter[0] = new Filter("status", FilterOperator.BT, 0, 4);
			} else {
				this._oListFilterState.aFilter[0] = new Filter("status", FilterOperator.EQ, sKey);
			}
			this.getModel("appView").setProperty("/layout", "OneColumn");
			this._applyFilterSearch();
		},

		/**
		 * Internal helper method to apply both filter and search state together on the list binding
		 * @private
		 */
		_applyFilterSearch: function () {
			// this._oListFilterState.aFilter[0] = status filter
			// this._oListFilterState.aFilter[1] = project filter
			// this._oListFilterState.aFilter[2] = foreman filter (in case user is foreman)
			var aFilters = this._oListFilterState.aFilter.concat(this._oListFilterState.aSearch),
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

		/**
		 * Internal helper method that sets the filter bar visibility property and the label's caption to be shown
		 * @param {string} sFilterBarText the selected filter value
		 * @private
		 */
		_updateFilterBar: function (sFilterBarText) {
			var oViewModel = this.getModel("masterView");
			oViewModel.setProperty("/isFilterBarVisible", (this._oListFilterState.aFilter.length > 1));
			oViewModel.setProperty("/filterBarLabel", this.getResourceBundle().getText("masterFilterBarText", [sFilterBarText]));
		}

	});
});