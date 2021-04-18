sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/m/GroupHeaderListItem",
	"sap/m/MessageBox",
	"../model/formatter",
	"sap/m/library"
], function (BaseController, JSONModel, Filter, FilterOperator, Sorter, GroupHeaderListItem, MessageBox, formatter, mobileLibrary) {
	"use strict";

	// shortcut for sap.m.URLHelper
	var URLHelper = mobileLibrary.URLHelper;

	return BaseController.extend("labour.timesheet.LabourTimesheet.controller.Detail", {

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
				shiftWorkingHours: 0,
				actualWorkingHours: 0,
				idleHours: 0
			});

			this.getRouter().getRoute("object").attachPatternMatched(this._onObjectMatched, this);

			this.setModel(oViewModel, "detailView");

			this.getOwnerComponent().getModel().metadataLoaded().then(this._onMetadataLoaded.bind(this));

			// initial date is today
			this.byId("datePicker").setDateValue(new Date());
		},

		setSurroundingValues: function () {
			var oViewModel = this.getModel("detailView"),
				oTSList = this.byId("timesheetList"),
				aItems = oTSList.getItems(),
				sShiftPartID,
				mActualWorkingHours = 0,
				oShift = {},
				mKPI,
				sValueState = "None";

			if (aItems && aItems.length > 0) {
				// aItems[0] is a groupheader; all items must be within the same shift
				sShiftPartID = aItems[1].getBindingContext().getProperty("shiftPart_ID");
				oShift = this.getShiftIDAndName(sShiftPartID); // returns ID and shiftName
				oViewModel.setProperty("/shiftName", oShift.shiftName);
				oViewModel.setProperty("/shiftWorkingHours", this.getWorkingHoursOfShift(oShift.ID));
				for (var i = 0; i < aItems.length; i++) {
					if (!(aItems[i] instanceof sap.m.GroupHeaderListItem)) {
						mActualWorkingHours += Number(aItems[i].getBindingContext().getProperty("hoursWorked"));
					}
				}
				oViewModel.setProperty("/actualWorkingHours", mActualWorkingHours);
				oViewModel.setProperty("/idleHours", oViewModel.getProperty("/shiftWorkingHours") - mActualWorkingHours);
				mKPI = mActualWorkingHours / Number(oViewModel.getProperty("/shiftWorkingHours"));
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

		clearSurroundingValues: function () {
			// if after object changed or date changed there is no data then old values would stay
			var oViewModel = this.getModel("detailView");
			oViewModel.setProperty("/shiftName", "");
			oViewModel.setProperty("/shiftWorkingHours", 0);
			oViewModel.setProperty("/actualWorkingHours", 0);
			oViewModel.setProperty("/idleHours", 0);
			this.byId("objectHeader").setNumberState("None");
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		onDateChanged: function (oEvent) {
			//var sDate = oEvent.getParameter("value");
			//this.getModel("appView").setProperty("/selectedDate", new Date(sDate));
			this.clearSurroundingValues();
			this.filterTimesheet();
		},

		minusDay: function () {
			var oDate = new Date(this.getModel("appView").getProperty("/selectedDate"));
			oDate.setDate(oDate.getDate() - 1);
			this.getModel("appView").setProperty("/selectedDate", new Date(oDate));
			this.clearSurroundingValues();
			this.filterTimesheet();
		},

		plusDay: function () {
			var oDate = new Date(this.getModel("appView").getProperty("/selectedDate"));
			oDate.setDate(oDate.getDate() + 1);
			this.getModel("appView").setProperty("/selectedDate", new Date(oDate));
			this.clearSurroundingValues();
			this.filterTimesheet();
		},

		/**
		 * Event handler when the share by E-Mail button has been clicked
		 * @public
		 */
		onSendEmailPress: function () {
			var oViewModel = this.getModel("detailView");

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
			var oViewModel = this.getModel("detailView"),
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
			var sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView"),
				oTSList = this.byId("timesheetList");

			// only update the counter if the length is final
			if (oTSList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("detailLineItemTableHeadingCount", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("detailLineItemTableHeading");
				}
				oViewModel.setProperty("/lineItemListTitle", sTitle);
				this.setSurroundingValues();
			}
		},

		filterTimesheet: function () {
			var oDateBegin = new Date(this.getModel("appView").getProperty("/selectedDate")),
				oDateEnd = new Date(this.getModel("appView").getProperty("/selectedDate"));

			oDateBegin.setHours(0, 0, 0, 0);
			oDateEnd.setHours(23, 59, 59);
			this.byId("timesheetList").getBinding("items").filter(new Filter("workingDate", FilterOperator.BT, oDateBegin, oDateEnd));
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
			if (this.byId("timesheetList").getSelectedItems().length > 0) {
				this.getModel("detailView").setProperty("/selected", true);
			} else {
				this.getModel("detailView").setProperty("/selected", false);
			}
		},

		onDelete: function () {
			var aItems = this.byId("timesheetList").getSelectedItems(),
				oModel = this.getModel(),
				oViewModel = this.getModel("detailView"),
				sConfirmText = this.getResourceBundle().getText("timesheetDeleteDialogText"),
				sConfirmTitle = this.getResourceBundle().getText("timesheetDeleteDialogTitle");

			MessageBox.confirm(sConfirmText, {
				icon: MessageBox.Icon.WARNING,
				title: sConfirmTitle,
				actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
				initialFocus: MessageBox.Action.CANCEL,
				onClose: function (sAction) {
					if (sAction === "OK") {
						for (var i = 0; i < aItems.length; i++) {
							oModel.remove(aItems[i].getBindingContext().getPath());
						}
						oViewModel.setProperty("/selected", false);
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
			var sObjectId = oEvent.getParameter("arguments").objectId;
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getModel().metadataLoaded().then(function () {
				var sObjectPath = this.getModel().createKey("Persons", {
					ID: sObjectId
				});
				this._bindView("/" + sObjectPath);
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
			var oViewModel = this.getModel("detailView");

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
				// if object could not be found, the selection in the master list
				// does not make sense anymore.
				this.getOwnerComponent().oListSelector.clearMasterListSelection();
				return;
			}

			var sPath = oElementBinding.getPath(),
				oResourceBundle = this.getResourceBundle(),
				oObject = oView.getModel().getObject(sPath),
				sObjectId = oObject.ID,
				sObjectName = oObject.worker_ID,
				oViewModel = this.getModel("detailView");

			this.getOwnerComponent().oListSelector.selectAListItem(sPath);

			this.clearSurroundingValues();
			this.filterTimesheet();
			this.getModel("detailView").setProperty("/selcted", false); // disables the delete button

			oViewModel.setProperty("/saveAsTileTitle", oResourceBundle.getText("shareSaveTileAppTitle", [sObjectName]));
			oViewModel.setProperty("/shareOnJamTitle", sObjectName);
			oViewModel.setProperty("/shareSendEmailSubject",
				oResourceBundle.getText("shareSendEmailObjectSubject", [sObjectId]));
			oViewModel.setProperty("/shareSendEmailMessage",
				oResourceBundle.getText("shareSendEmailObjectMessage", [sObjectName, sObjectId, location.href]));
		},

		_onMetadataLoaded: function () {
			// Store original busy indicator delay for the detail view
			var iOriginalViewBusyDelay = this.getView().getBusyIndicatorDelay(),
				oViewModel = this.getModel("detailView"),
				oLineItemTable = this.byId("timesheetList"),
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
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			// No item should be selected on master after detail page is closed
			this.getOwnerComponent().oListSelector.clearMasterListSelection();
			this.getRouter().navTo("master");
		},

		/**
		 * Toggle between full and non full screen mode.
		 */
		toggleFullScreen: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/midColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "MidColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout", this.getModel("appView").getProperty("/previousLayout"));
			}
		}
	});

});