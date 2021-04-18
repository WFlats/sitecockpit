sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, MessageBox) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.CreateDiscipline", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				enableSave: false,
				disciplineID: "",
				disciplinePath: "",
				disciplineColor: "",
				viewTitle: ""
			});
			this.setModel(oViewModel, "createDisciplineView");
			this.getRouter().getTargets().getTarget("CreateDiscipline").attachDisplay(null, this._onDisplay, this);
		},

		_onDisplay: function (oEvent) {
			var sObjectId = oEvent.getParameter("data").objectId,
				sMode = oEvent.getParameter("data").mode,
				oModel = this.getModel(),
				sObjectPath = "/" + oModel.createKey("Disciplines", {
					ID: sObjectId
				});
			this.getModel("createDisciplineView").setProperty("/mode", sMode);
			this.getModel("createDisciplineView").setProperty("/disciplineID", sObjectId);
			this.getModel("createDisciplineView").setProperty("/disciplinePath", sObjectPath);
			this.getModel().metadataLoaded().then(function () {
				this._bindView(sObjectPath);
			}.bind(this));
		},

		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oModel = this.getModel(),
				oViewModel = this.getModel("createDisciplineView");
			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);
			if (oViewModel.getProperty("/mode") === "Edit") {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("editDisciplineViewTitle"));
				this.getView().bindElement({
					path: sObjectPath,
					events: {
						dataRequested: function () {
							oViewModel.setProperty("/busy", true);
						},
						dataReceived: function () {
							oViewModel.setProperty("/busy", false);
						}
					}
				});
			} else {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("createDisciplineViewTitle"));
				var oContext = oModel.createEntry("Disciplines");
				this.getView().setBindingContext(oContext);
			}
		},

		_validateSaveEnablement: function () {
			if (!this.getView().getBindingContext() || this.getView().getBindingContext() === undefined) { // this function gets called again on navback after unbindObject
				return;
			}
			var sCode = this.byId("code").getValue(),
				sDescription = this.byId("description").getValue(),
				sColor = this.getModel("createDisciplineView").getProperty("/disciplineColor"),
				bSaveEnabled = false;
			if (this.getModel("createDisciplineView").getProperty("/mode") === "Create") {
				if (sCode && sDescription) {
					bSaveEnabled = true;
				}
			} else { //Edit
				var oData = this.getView().getBindingContext().getObject({
					select: "*"
				});
				if (sCode !== "" && sDescription !== "") {
					if (sCode !== oData.code || sDescription !== oData.description || sColor !== oData.colour) {
						bSaveEnabled = true;
					}
				}
			}
			this.getModel("createDisciplineView").setProperty("/enableSave", bSaveEnabled);
		},

		colorPicked: function (oEvent) {
			this.getModel("createDisciplineView").setProperty("/disciplineColor", oEvent.getParameter("hex"));
			this._validateSaveEnablement();
		},

		onSave: function () {
			var oModel = this.getModel(),
				oBC = this.getView().getBindingContext(),
				sCode = this.byId("code").getValue(),
				sDescription = this.byId("description").getValue(),
				sColor = this.getModel("createDisciplineView").getProperty("/disciplineColor"),
				that = this;

			this._isCodeUnique(sCode).then(function (bCodeUnique) {
				var bCanBeSaved = bCodeUnique;
				if (that.getModel("createDisciplineView").getProperty("/mode") === "Edit" && sCode === oModel.getProperty("code", oBC)) {
					bCanBeSaved = true; // if mode = Edit then the same code is valid
				}
				if (!bCanBeSaved) {
					MessageBox.information(
						that.getResourceBundle().getText("codeNotUnique"), {
							id: "codeNotUniqueInfoMessageBox"
								//styleClass: that.getOwnerComponent().getContentDensityClass()
						}
					);
				} else {
					if (!oModel.setProperty("code", sCode, oBC) || !oModel.setProperty("description", sDescription, oBC) || !oModel.setProperty(
							"colour",
							sColor, oBC)) {
						MessageBox.error(that.getResourceBundle().getText("updateError"));
						return;
					}
					if (that.getModel("createDisciplineView").getProperty("/mode") === "Edit" && !oModel.hasPendingChanges()) {
						MessageBox.information(
							that.getResourceBundle().getText("noChangesMessage"), {
								id: "noChangesInfoMessageBox"
									//styleClass: that.getOwnerComponent().getContentDensityClass()
							}
						);
						return;
					}
					oModel.submitChanges();
					that.getView().unbindObject();
					that.onCancel();
				}
			});
		},

		onDelete: function () {
			var sPath = this.getView().getBindingContext().getPath(),
				oModel = this.getModel(),
				sConfirmTitle = this.getResourceBundle().getText("disciplineDeleteConfirmationTitle"),
				sConfirmText = this.getResourceBundle().getText("disciplineDeleteConfirmationText"),
				that = this;

			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (sAction) {
						if (sAction === "YES") {
							oModel.remove(sPath);
							that.getView().unbindObject();
							that.onCancel();
						}
					}
				}
			);
		},

		onCancel: function () {
			var oModel = this.getModel();
			if (this.getModel("createDisciplineView").getProperty("/mode") === "Create") {
				oModel.deleteCreatedEntry(this.getView().getBindingContext());
			}
			this.getModel("createDisciplineView").setProperty("/enableSave", false);
			this.getView().unbindObject();
			this.getRouter().getTargets().display("Disciplines");
		},

		_isCodeUnique: function (sCode) {
			var oModel = this.getModel(),
				sPath = "/Disciplines",
				aFilter = [new Filter({
					path: "code",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: sCode
				})];

			return new Promise(function (resolve, reject) {
				oModel.read(sPath, {
					urlParameters: {
						$inlinecount: "allpages",
						$top: 1
					},
					filters: aFilter,
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
		}

	});

});