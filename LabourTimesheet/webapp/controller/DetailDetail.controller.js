sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/m/GroupHeaderListItem",
	"sap/m/MessageBox",
	"sap/base/Log",
	"../model/formatter",
	"sap/m/library"
], function (BaseController, JSONModel, Filter, FilterOperator, Sorter, GroupHeaderListItem, MessageBox, Log, formatter, mobileLibrary) {
	"use strict";

	var URLHelper = mobileLibrary.URLHelper;

	return BaseController.extend("labour.timesheet.LabourTimesheet.controller.DetailDetail", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		onInit: function () {
			// Model used to manipulate control states. The chosen values make sure,
			// detail page is busy indication immediately so there is no break in
			// between the busy indication for loading the view's meta data
			var oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				lineItemListTitle: this.getResourceBundle().getText("detailLineItemTableHeading"),
				selected: false,
				shiftName: "",
				idleHours: 0,
				selectedPersonID: ""
			});

			this.getRouter().getRoute("DetailDetail").attachPatternMatched(this._onObjectMatched, this);
			this.setModel(oViewModel, "detailDetailView");
			this.getOwnerComponent().getModel().metadataLoaded().then(this._onMetadataLoaded.bind(this));
		},

		setObjectHeader: function () {
			var oViewModel = this.getModel("detailDetailView"),
				oTSList = this.byId("timesheetDetailList"),
				aItems = oTSList.getItems(),
				sShiftPartID,
				mWorkingHours = this.getView().getBindingContext().getProperty("hoursWorked"),
				mShiftHours = this.getView().getBindingContext().getProperty("hoursShift"),
				oShift = {},
				mKPI,
				sValueState = "None";

			if (aItems && aItems.length > 1) {
				// aItems[0] is a groupheader; all items must be within the same shift
				sShiftPartID = aItems[1].getBindingContext().getProperty("shiftPart_ID");
				oShift = this.getShiftIDAndName(sShiftPartID); // returns ID and shiftName
				oViewModel.setProperty("/shiftName", oShift.shiftName);
				oViewModel.setProperty("/idleHours", parseFloat(mShiftHours - mWorkingHours).toFixed(3));
				mKPI = mWorkingHours / mShiftHours;
				if (mKPI >= 0.75) {
					sValueState = "Success";
				} else if (mKPI >= 0.50) {
					sValueState = "Warning";
				} else if (mKPI > 0) {
					sValueState = "Error";
				}
				this.byId("objectHeader").setNumberState(sValueState);
			}
		},

		clearObjectHeader: function () {
			// if after object changed or date changed there is no data then old values would stay
			var oViewModel = this.getModel("detailDetailView");
			oViewModel.setProperty("/shiftName", "");
			oViewModel.setProperty("/idleHours", 0);
			this.byId("objectHeader").setNumberState("None");
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * Event handler when the share by E-Mail button has been clicked
		 * @public
		 */
		onSendEmailPress: function () {
			var oViewModel = this.getModel("detailDetailView");

			URLHelper.triggerEmail(
				null,
				oViewModel.getProperty("/shareSendEmailSubject"),
				oViewModel.getProperty("/shareSendEmailMessage")
			);
		},

		/**
		 * Event handler when the share in JAM button has been clicked
		 * @public
		 */
		onShareInJamPress: function () {
			var oViewModel = this.getModel("detailDetailView"),
				oShareDialog = sap.ui.getCore().createComponent({
					name: "sap.collaboration.components.fiori.sharing.dialog",
					settings: {
						object: {
							id: location.href,
							share: oViewModel.getProperty("/shareOnJamTitle")
						}
					}
				});

			oShareDialog.open();
		},

		/**
		 * Updates the item count within the line item table's header
		 * @param {object} oEvent an event containing the total number of items in the list
		 * @private
		 */
		onListUpdateFinished: function (oEvent) {
			var oModel = this.getModel(),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailDetailView"),
				oTSList = this.byId("timesheetDetailList"),
				aItems = [],
				aTasks = [],
				oTimesheetBC = this.getView().getBindingContext(),
				that = this;

			// only update the counter if the length is final
			if (oTSList.getBinding("items").isLengthFinal()) {
				if (!iTotalItems) {
					sTitle = this.getResourceBundle().getText("timesheetEntriesTitle");
					// remove timesheet if no entries are left && the timesheet still exists
					if (oTimesheetBC.getObject()) {
						oModel.remove(oTimesheetBC.getPath(), {
							success: function () {
								that.onCloseDetailPress();
							},
							error: function (oError) {
								Log.error("Error deleting timesheet after deleting all entries");
							}
						});
					}
				} else {
					sTitle = this.getResourceBundle().getText("timesheetEntriesTitleCount", [iTotalItems]);
					// update actual hours and cost if changed
					aItems = oTSList.getItems();
					oModel.setProperty("hoursWorked", that.getHoursWorkedOfTimesheet(aItems), oTimesheetBC);
					oModel.setProperty("costWorking", that.getCostWorkedOfTimesheet(aItems), oTimesheetBC);
					oModel.submitChanges({ // will not trigger an HTTP request if the values didn't change
						success: function () {
							that.setObjectHeader();
						},
						error: function (oError) {
							Log.error("Error updating timesheet after removal of entries");
						}
					});
				}
				this.setObjectHeader();
				oViewModel.setProperty("/lineItemListTitle", sTitle);
			}
		},

		getTask: function (oContext) {
			return oContext.getProperty("task/location/code") + " " + oContext.getProperty("task/location/description") +
				" / " + oContext.getProperty("task/taskName") + " (" + oContext.getProperty("task/number") + ") - " +
				oContext.getProperty("task/shortText");
		},

		createGroupHeader: function (oGroup) {
			return new GroupHeaderListItem({
				title: oGroup.key,
				upperCase: false
			});
		},

		onSelectionChange: function () {
			if (this.byId("timesheetDetailList").getSelectedItems().length > 0) {
				this.getModel("detailDetailView").setProperty("/selected", true);
			} else {
				this.getModel("detailDetailView").setProperty("/selected", false);
			}
		},

		onDelete: function () {
			var oTimesheetEntriesList = this.byId("timesheetDetailList"),
				aItems = oTimesheetEntriesList.getSelectedItems(),
				aTasks = this._getTasksOfTimesheetEntries(aItems), // get them before timesheetEntries are deleted:-)
				oModel = this.getModel(),
				oViewModel = this.getModel("detailDetailView"),
				sConfirmText = this.getResourceBundle().getText("timesheetDeleteDialogText"),
				sConfirmTitle = this.getResourceBundle().getText("timesheetDeleteDialogTitle"),
				that = this;

			MessageBox.confirm(sConfirmText, {
				icon: MessageBox.Icon.WARNING,
				title: sConfirmTitle,
				actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
				initialFocus: MessageBox.Action.CANCEL,
				onClose: function (sAction) {
					if (sAction === "OK") {
						for (var i = 0; i < aItems.length; i++) {
							oModel.remove(aItems[i].getBindingContext().getPath(), {
								success: function () {
									oViewModel.setProperty("/selected", false);
									if (i === aItems.length) {
										// update tasks
										that._updateTasksWithActualLaborCost(aTasks);
									}
									// Timesheet gets updated/deleted in the onListUpdateFinished handler
								},
								error: function (oError) {
									Log.error("Error deleting timesheet entries");
								}
							});
						}
					}
				}
			});
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		/**
		 * Binds the view to the object path and expands the aggregated line items.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onObjectMatched: function (oEvent) {
			var oModel = this.getModel(),
				sPersonID = oEvent.getParameter("arguments").objectId,
				sTimesheetID = oEvent.getParameter("arguments").objectId2,
				sPersonPath = oModel.createKey("Persons", {
					ID: sPersonID
				}),
				sTimesheetPath = oModel.createKey("Timesheets", {
					ID: sTimesheetID
				});

			this.getModel("detailDetailView").setProperty("/selectedPersonID", sPersonID);
			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			sTimesheetPath = "t" + sTimesheetPath.slice(1, sTimesheetPath.length);
			this.getModel().metadataLoaded().then(function () {
				this._bindView("/" + sPersonPath + "/" + sTimesheetPath);
			}.bind(this));
		},

		/**
		 * Binds the view to the object path. Makes sure that detail view displays
		 * a busy indicator while data for the corresponding element binding is loaded.
		 * @function
		 * @param {string} sObjectPath path to the object to be bound to the view.
		 * @private
		 */
		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oViewModel = this.getModel("detailDetailView");

			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);

			this.getView().bindElement({
				path: sObjectPath,
				events: {
					change: this._onBindingChange.bind(this),
					dataRequested: function () {
						oViewModel.setProperty("/busy", true);
					},
					dataReceived: function () {
						oViewModel.setProperty("/busy", false);
					}
				}
			});
		},

		_onBindingChange: function () {
			var oView = this.getView(),
				oElementBinding = oView.getElementBinding();

			// No data for the binding
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display("detailObjectNotFound");
				return;
			}
			/*
						var sPath = oElementBinding.getPath(),
							oResourceBundle = this.getResourceBundle(),
							oObject = oView.getModel().getObject(sPath),
							sObjectId = oObject.ID,
							sObjectName = oObject.worker_ID,
							oViewModel = this.getModel("detailDetailView");

						this.getOwnerComponent().oListSelector.selectAListItem(sPath);

						this.clearObjectHeader();
						//this.filterTimesheet();
						this.getModel("detailDetailView").setProperty("/selcted", false); // disables the delete button

						oViewModel.setProperty("/saveAsTileTitle", oResourceBundle.getText("shareSaveTileAppTitle", [sObjectName]));
						oViewModel.setProperty("/shareOnJamTitle", sObjectName);
						oViewModel.setProperty("/shareSendEmailSubject",
							oResourceBundle.getText("shareSendEmailObjectSubject", [sObjectId]));
						oViewModel.setProperty("/shareSendEmailMessage",
							oResourceBundle.getText("shareSendEmailObjectMessage", [sObjectName, sObjectId, location.href]));
			*/
		},

		_onMetadataLoaded: function () {
			// Store original busy indicator delay for the detail view
			var iOriginalViewBusyDelay = this.getView().getBusyIndicatorDelay(),
				oViewModel = this.getModel("detailDetailView"),
				oLineItemTable = this.byId("timesheetDetailList"),
				iOriginalLineItemTableBusyDelay = oLineItemTable.getBusyIndicatorDelay();

			// Make sure busy indicator is displayed immediately when
			// detail view is displayed for the first time
			oViewModel.setProperty("/delay", 0);
			oViewModel.setProperty("/lineItemTableDelay", 0);

			oLineItemTable.attachEventOnce("updateFinished", function () {
				// Restore original busy indicator delay for line item table
				oViewModel.setProperty("/lineItemTableDelay", iOriginalLineItemTableBusyDelay);
			});

			// Binding the view will set it to not busy - so the view is always busy if it is not bound
			oViewModel.setProperty("/busy", true);
			// Restore original busy indicator delay for the detail view
			oViewModel.setProperty("/delay", iOriginalViewBusyDelay);
		},

		/**
		 * Set the full screen mode to false and navigate to master page
		 */
		onCloseDetailPress: function () {
			this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", false);
			// No item should be selected on master after detail page is closed
			this.getRouter().navTo("object", {
				objectId: this.getModel("detailDetailView").getProperty("/selectedPersonID")
			});
		},

		/**
		 * Toggle between full and non full screen mode.
		 */
		toggleFullScreen: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/endColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "EndColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout", this.getModel("appView").getProperty("/previousLayout"));
			}
		}
	});

});