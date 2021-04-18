sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"../model/formatter",
	"sap/ui/core/format/DateFormat"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator, formatter, DateFormat) {
	"use strict";

	return BaseController.extend("project.data.ProjectData.controller.SpecialDates", {

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
				mode: "None",
				enableSave: false,
				lineItemTableDelay: 0,
				specialDatesTitle: "",
				specialDatesID: ""
			});
			this.setModel(oViewModel, "specialDatesView");

			this.getRouter().getRoute("SpecialDates").attachPatternMatched(this._onObjectMatched, this);
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		_onObjectMatched: function (oEvent) {
			var sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sObjectId = oEvent.getParameter("arguments").objectId,
				oModel = this.getModel(),
				oContext,
				sPath,
				sTitle;
			// sMode = oEvent.getParameter("arguments").mode; doesn't work here; detect mode by appView/value of sObjectId

			if (this.getModel("appView").getProperty("mode") === "Create" || sObjectId === "xxx") { // revisit: passing an undefined objectId doesn't work
				oContext = oModel.createEntry("/SpecialDates", {
					properties: {
						project_ID: sProjectID
					}
				});
				this.getView().setBindingContext(oContext);
				sTitle = this.getResourceBundle().getText("specialDateCreateTitle");
				this.getModel("specialDatesView").setProperty("/specialDatesTitle", sTitle);
			} else {
				oContext = new sap.ui.model.Context(oModel, sPath);
				sTitle = this.getResourceBundle().getText("specialDateEditTitle");
				this.getModel("specialDatesView").setProperty("/specialDatesTitle", sTitle);
				this.getModel().metadataLoaded().then(function () {
					sPath = this.getModel().createKey("SpecialDates", {
						ID: sObjectId
					});
					this._bindView("/" + sPath);
				}.bind(this));
			}
		},

		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oViewModel = this.getModel("specialDatesView");

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
				oElementBinding = oView.getElementBinding(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID");

			if (!sProjectID) {
				return; // initial rendering; appView not available
			}
			// No data for the binding
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display("detailObjectNotFound");
				return;
			}
			this.byId("DP").setDateValue(oElementBinding.getBoundContext().getObject().specialDate);
		},

		onSave: function () {
			var oModel = this.getModel(),
				oView = this.getModel("specialDatesView"),
				oBC = this.getView().getBindingContext(),
				oDate = this.byId("DP").getDateValue(),
				oDescription = this.byId("description");

			oDate = this.adjustUTC(oDate);
			oModel.setProperty("specialDate", oDate, oBC);
			oModel.setProperty("description", oDescription.getValue(), oBC);
			oModel.submitChanges();
			oView.setProperty("/enableSave", false);
			this.onCloseDetailPress();
		},

		_validateSaveEnablement: function () {
			var oView = this.getModel("specialDatesView"),
				oBC = this.getView().getBindingContext(),
				oData = oBC.getObject(),
				oDP = this.byId("DP"),
				oDescription = this.byId("description");

			oView.setProperty("/enableSave", false);
			if (oDP.getDateValue()) { // required
				if (oDP.getDateValue() !== oData.specialDate || oDescription.getValue() !== oData.description) {
					oView.setProperty("/enableSave", true);
				}
			}
		},

		onDeleteSpecialDate: function () {
			var sPath = this.getView().getBindingContext().getPath(),
				oModel = this.getModel(),
				sConfirmText = this.getResourceBundle().getText("confirmDeletionSpecialDateText"),
				sConfirmTitle = this.getResourceBundle().getText("confirmDeletionSpecialDateTitle");

			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
					initialFocus: MessageBox.Action.CANCEL,
					onClose: function (sAction) {
						if (sAction === "OK") {
							oModel.remove(sPath);
						}
					}
				}
			);
			this.onCloseDetailPress();
		},

		onCancel: function () {
			this.onCloseDetailPress();
		},

		onCloseDetailPress: function () {
			var oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID");
			this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", false);
			/*			if (oModel.hasPendingChanges(false)) {
							oModel.resetChanges(); // just in case 
						} */
			// revisit: special dates list in detail view doesn't get updated after a special date was added
			this.getRouter().navTo("object", {
				objectId: sProjectID
			});
		},

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